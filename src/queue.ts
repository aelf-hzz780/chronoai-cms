import { randomUUID } from 'node:crypto';
import { Store } from './store.ts';
import { AppError } from './errors.ts';

export interface Lease { jobId: string; resourceId: string; token: string; generation: number; }
export class Queue {
  store: Store;
  constructor(store: Store) { this.store = store; }
  claim(kind: 'release' | 'delivery', expire: (resourceId: string) => void): Lease | null {
    return this.store.transaction(() => {
      if (this.store.get("SELECT value FROM settings WHERE key='outbound_paused'")?.value !== 'false') return null;
      const now = new Date().toISOString();
      for (const job of this.store.all("SELECT * FROM jobs WHERE kind=? AND state='running' AND lease_until<=?", kind, now)) {
        expire(job.resource_id);
        this.store.run("UPDATE jobs SET state='queued',lease_until=NULL WHERE id=?", job.id);
      }
      const job = this.store.get("SELECT * FROM jobs WHERE kind=? AND state='queued' ORDER BY created_at,rowid LIMIT 1", kind);
      if (!job) return null;
      const token = randomUUID(), generation = (this.store.get('SELECT generation FROM job_leases WHERE job_id=?', job.id)?.generation ?? 0) + 1;
      this.store.run('INSERT INTO job_leases VALUES (?,?,?) ON CONFLICT(job_id) DO UPDATE SET token=excluded.token,generation=excluded.generation', job.id, token, generation);
      this.store.run("UPDATE jobs SET state='running',lease_until=? WHERE id=?", new Date(Date.now() + 120000).toISOString(), job.id);
      return { jobId: job.id, resourceId: job.resource_id, token, generation };
    });
  }
  owns(lease: Lease) {
    return !!this.store.get("SELECT 1 FROM jobs j JOIN job_leases l ON l.job_id=j.id WHERE j.id=? AND j.state='running' AND j.lease_until>? AND l.token=? AND l.generation=?", lease.jobId, new Date().toISOString(), lease.token, lease.generation);
  }
  guard(lease: Lease) { if (!this.owns(lease)) throw new AppError(409, 'LEASE_LOST', 'A newer worker owns this operation'); }
  mutate(lease: Lease, operation: () => void, finish = false): boolean {
    return this.store.transaction(() => {
      if (!this.owns(lease)) return false;
      operation();
      if (finish) this.store.run("UPDATE jobs SET state='done',lease_until=NULL WHERE id=?", lease.jobId);
      return true;
    });
  }
}
