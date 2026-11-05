#!/usr/bin/env python3
"""Run an isolated, real official NyxID proxy/approval capability probe.

No production credentials, live database, third-party destination or source patches.
Every generated secret stays under the new --output directory (mode 0700).
Use --wait-expiry to observe the real 300-second delegated-token lifetime.
"""
import argparse
import base64
import concurrent.futures
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import uuid
import urllib.parse

COMMIT = '38bae2f7825bfa70d8a9e4e837118d7d9658e6a5'
BACKEND = 'ghcr.io/chronoaiproject/nyxid/backend@sha256:989c2af8e68d843ca2f1e65ab99323d44190f87d16285db49778de37aa59e5f2'
FRONTEND = 'ghcr.io/chronoaiproject/nyxid/frontend@sha256:d211a8ca3db156966ea6a2ed2542322ee99c28673a315f19ad1e21d5b20f97c4'
MOCK = '''import {createServer} from 'node:http';
const records=[];let minted={};
createServer(async(req,res)=>{let data='';for await(const b of req)data+=b;res.setHeader('content-type','application/json');
if(req.url==='/captures'){res.end(JSON.stringify(records));return;}
if(req.url==='/minted'){res.end(JSON.stringify(minted));return;}
if(req.url==='/mint'){minted={identity:req.headers['x-nyxid-identity-token'],delegation:req.headers['x-nyxid-delegation-token']};res.end(JSON.stringify({captured:!!minted.delegation}));return;}
records.push({at:new Date().toISOString(),method:req.method,path:req.url,body:data});
if(data.includes('response_lost'))await new Promise(r=>setTimeout(r,3000));
res.end(JSON.stringify({id:records.length,ok:true}));}).listen(8080,'0.0.0.0');
'''


class Probe:
    def __init__(self, args):
        self.args = args
        self.output = Path(args.output).resolve()
        self.output.mkdir(parents=True, exist_ok=False)
        self.private = self.output / 'private'
        self.private.mkdir(mode=0o700)
        self.prefix = 'nyxid-m0-' + uuid.uuid4().hex[:10]
        self.backend = self.prefix + '-backend'
        self.mongo_name = self.prefix + '-mongo'
        self.provider = self.prefix + '-provider'
        self.network = self.prefix + '-network'
        self.docker = ['docker', '--context', args.docker_context]
        self.state = {}
        self.evidence = {'officialCommit': COMMIT, 'backendImage': BACKEND,
                         'frontendImageIdentityOnly': FRONTEND,
                         'level': 'LIVE_OFFICIAL_ISOLATED_LOCAL_PROVIDER',
                         'formalAcceptance': False, 'productionChanged': False,
                         'thirdPartyWrites': 0, 'cases': [], 'notExercised': [
                             'real NyxBot conversation', 'official frontend approval UI',
                             'real CMS Publisher revocation during pending approval',
                             'real CMS cancellation during pending approval',
                             'real CMS original article update during pending approval',
                             'real DEV or organization provider account']}

    def run(self, args, **kwargs):
        result = subprocess.run(args, capture_output=True, text=True, **kwargs)
        if result.returncode:
            raise RuntimeError('Subprocess failed: ' + args[0] + ' exit ' + str(result.returncode))
        return result.stdout.strip()

    def dc(self, args, **kwargs):
        return self.run(self.docker + args, **kwargs)

    def save(self):
        target = self.output / 'result.json'
        temp = target.with_suffix('.tmp')
        temp.write_text(json.dumps(self.evidence, ensure_ascii=False, indent=2) + '\n')
        os.replace(temp, target)

    def save_private(self):
        path = self.private / 'fixture.json'
        path.write_text(json.dumps(self.state))
        path.chmod(0o600)

    def mongo(self, javascript):
        return self.dc(['exec', self.mongo_name, 'mongosh', '--quiet', 'nyxid_m0', '--eval', javascript])

    def api(self, path, token=None, body=None, method=None, form=False, provider=False, timeout=45):
        base = 'http://' + self.provider + ':8080' if provider else 'http://localhost:3001'
        cmd = self.docker + ['exec', '-i', self.backend, 'curl', '--max-time', str(timeout),
                             '-sS', '-w', '\n%{http_code}', '-H',
                             'Content-Type: application/x-www-form-urlencoded' if form else 'Content-Type: application/json']
        if token:
            cmd += ['-H', 'Authorization: Bearer ' + token]
        if method:
            cmd += ['-X', method]
        if body is not None:
            cmd += ['--data-binary', '@-']
        cmd += [base + path]
        value = urllib.parse.urlencode(body) if form else json.dumps(body)
        result = subprocess.run(cmd, input=value if body is not None else '', capture_output=True, text=True)
        if result.returncode:
            return {'http': 0, 'transportExit': result.returncode, 'body': None}
        data, code = result.stdout.rsplit('\n', 1)
        return {'http': int(code), 'body': json.loads(data) if data else None}

    def good(self, *args, **kwargs):
        result = self.api(*args, **kwargs)
        if not 200 <= result['http'] < 300:
            details = result.get('body') or {}
            raise RuntimeError('HTTP failure at ' + args[0] + ': ' + str(result['http']) + ' ' + str(details.get('error', 'transport')))
        return result['body']

    def setup(self):
        for image in [BACKEND, FRONTEND]:
            inspected = json.loads(self.dc(['image', 'inspect', image]))[0]
            assert inspected['Config']['Labels']['org.opencontainers.image.revision'] == COMMIT
        networks = json.loads(self.dc(['network', 'inspect'] + self.dc(['network', 'ls', '-q']).split()))
        occupied = [ipaddress.ip_network(s['Subnet']) for n in networks for s in (n['IPAM'].get('Config') or []) if s.get('Subnet')]
        subnet = next(ipaddress.ip_network('10.203.' + str(i) + '.0/24') for i in range(10, 250)
                      if all(not ipaddress.ip_network('10.203.' + str(i) + '.0/24').overlaps(old) for old in occupied))
        self.dc(['network', 'create', '--internal', '--subnet', str(subnet), self.network])
        self.dc(['run', '-d', '--name', self.mongo_name, '--network', self.network, '--memory', '640m',
                 '--cpus', '1', '--ulimit', 'nofile=64000:64000', 'mongo:8.0', 'mongod', '--replSet',
                 'm0rs', '--bind_ip_all', '--wiredTigerCacheSizeGB', '0.25'])
        for _ in range(100):
            try:
                self.mongo('db.adminCommand({ping:1}).ok')
                break
            except RuntimeError:
                time.sleep(.2)
        self.mongo('rs.initiate({_id:"m0rs",members:[{_id:0,host:' + json.dumps(self.mongo_name + ':27017') + '}]})')
        for _ in range(100):
            if self.mongo('rs.status().myState') == '1':
                break
            time.sleep(.2)
        private_key = self.private / 'private.pem'
        public_key = self.private / 'public.pem'
        self.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:4096', '-out', str(private_key)])
        self.run(['openssl', 'pkey', '-in', str(private_key), '-pubout', '-out', str(public_key)])
        env = {'DATABASE_URL': 'mongodb://' + self.mongo_name + ':27017/nyxid_m0?replicaSet=m0rs',
               'ENVIRONMENT': 'development', 'BASE_URL': 'http://localhost:33013',
               'JWT_ISSUER': 'http://localhost:3001', 'FRONTEND_URL': 'http://localhost:33010',
               'JWT_PRIVATE_KEY_PATH': '/app/keys/private.pem', 'JWT_PUBLIC_KEY_PATH': '/app/keys/public.pem',
               'ENCRYPTION_KEY': secrets.token_hex(32), 'PORT': '3001', 'INTERNAL_BIND_ADDR': '0.0.0.0:3002',
               'RUST_LOG': 'warn', 'RATE_LIMIT_PER_SECOND': '100', 'RATE_LIMIT_BURST': '200',
               'APPROVAL_EXPIRY_INTERVAL_SECS': '1', 'EMAIL_AUTH_ENABLED': 'true', 'AUTO_VERIFY_EMAIL': 'true'}
        envfile = self.private / 'backend.env'
        envfile.write_text(''.join(key + '=' + value + '\n' for key, value in env.items()))
        envfile.chmod(0o600)
        self.dc(['create', '--name', self.backend, '--network', self.network, '--memory', '512m', '--cpus', '1',
                 '--ulimit', 'nofile=64000:64000', '--env-file', str(envfile), BACKEND])
        for path in [private_key, public_key]:
            path.chmod(0o644)
            self.dc(['cp', str(path), self.backend + ':/app/keys/' + path.name])
            path.chmod(0o600)
        self.dc(['start', self.backend])
        mock = self.output / 'provider.mjs'
        mock.write_text(MOCK)
        self.dc(['create', '--name', self.provider, '--network', self.network, '--memory', '64m',
                 '--entrypoint', 'node', self.args.node_image, '/provider.mjs'])
        self.dc(['cp', str(mock), self.provider + ':/provider.mjs'])
        self.dc(['start', self.provider])
        for _ in range(100):
            health = self.api('/health')
            if health['http'] == 200:
                break
            time.sleep(.2)
        assert health['http'] == 200 and health['body']['commit'] == COMMIT[:12]
        self.evidence['health'] = health['body']
        self.evidence['runtime'] = {'network': self.network, 'subnet': str(subnet), 'internal': True,
                                    'containers': [self.backend, self.mongo_name, self.provider],
                                    'publishedPorts': [], 'database': 'nyxid_m0', 'sharedDatabaseAccess': False,
                                    'issuer': env['JWT_ISSUER'], 'audience': env['BASE_URL']}
        self.save()

    def fixture(self):
        self.mongo('db.feature_flag_overrides.insertOne({_id:"m0-invite",org_user_id:null,flag_key:"auth:invitation-code",target_kind:"global",target_key:null,enabled:false,created_at:new Date(),updated_at:new Date(),updated_by:"m0-test"})')
        for name in ['admin', 'member']:
            password = secrets.token_urlsafe(24)
            email = 'm0-' + name + '@example.test'
            user = self.good('/api/v1/auth/register', body={'email': email, 'password': password, 'display_name': 'M0 ' + name})
            login = self.good('/api/v1/auth/login', body={'email': email, 'password': password, 'client': 'token'})
            self.state[name] = {'id': user['user_id'], 'token': login['access_token']}
        a, m = self.state['admin']['token'], self.state['member']['token']
        self.state['org'] = self.good('/api/v1/orgs', a, {'display_name': 'M0 Native Approval'})
        self.org = self.state['org']['id']
        self.good('/api/v1/orgs/' + self.org + '/members', a, {'user_id': self.state['member']['id'], 'role': 'member'})
        for label, owner, token in [('cms', None, m), ('provider', self.org, a)]:
            body = {'label': 'M0 ' + label, 'slug': 'm0-' + label, 'endpoint_url': 'http://' + self.provider + ':8080', 'auth_method': 'none'}
            if owner:
                body['target_org_id'] = owner
            if label == 'cms':
                body.update(identity_propagation_mode='jwt', identity_jwt_audience='m0-cms', inject_delegation_token=True,
                            delegation_token_scope='account:read proxy:*')
            self.state[label] = self.good('/api/v1/keys', token, body)
        self.pid = self.state['provider']['id']
        self.good('/api/v1/approvals/service-configs/' + self.state['cms']['id'], m,
                  {'approval_required': False, 'default_effect': 'auto_allow'}, 'PUT')
        self.good('/api/v1/approvals/service-configs/' + self.pid + '?org_id=' + self.org, a,
                  {'approval_required': True, 'approval_mode': 'per_request', 'default_effect': 'require_approval'}, 'PUT')
        self.state['agentKey'] = self.good('/api/v1/api-keys', m,
                                         {'name': 'M0 source agent', 'scopes': 'proxy', 'allow_all_services': True, 'never_expires': True})
        self.state['client'] = self.good('/oauth/register', body={'client_name': 'M0 CMS introspection',
                                         'redirect_uris': ['http://localhost:33015/auth/callback'], 'scope': 'openid profile proxy',
                                         'token_endpoint_auth_method': 'none'})
        self.save_private()

    def mint(self, key=None):
        self.good('/api/v1/proxy/s/m0-cms/mint', key or self.state['agentKey']['full_key'])
        return self.good('/minted', provider=True)['delegation']

    def introspect(self, token):
        return self.api('/oauth/introspect', body={'client_id': self.state['client']['client_id'], 'token': token}, form=True)

    def captures(self):
        return self.good('/captures', provider=True)

    def pending(self):
        return [r for r in self.good('/api/v1/approvals/requests?include_admin_orgs=true&status=pending', self.state['admin']['token'])['requests']
                if r.get('org_id') == self.org]

    def wait_pending(self, previous):
        for _ in range(100):
            found = [r for r in self.pending() if r['id'] not in previous]
            if found:
                return found[0]
            time.sleep(.1)
        raise RuntimeError('No native pending approval barrier observed')

    def case(self, name, mutation=None, restore=None, approve=True, timeout=45, disconnect=False):
        previous = {r['id'] for r in self.pending()}
        before = len(self.captures())
        body = {'article': {'title': 'M0 ' + name, 'body_markdown': 'FULL_ARTICLE_SENTINEL_' + name + '_' + 'x' * 1000,
                            'published': False}, 'case': name}
        token = self.mint()
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(self.api, '/api/v1/proxy/s/m0-provider/articles?_nyxid_via=' + self.pid,
                                 token, body, timeout=timeout)
            row = self.wait_pending(previous)
            barrier = len(self.captures())
            assert barrier == before
            stored = json.loads(self.mongo('JSON.stringify(db.approval_requests.findOne({_id:' + json.dumps(row['id']) + '}))'))
            changed = mutation(row) if mutation else None
            if disconnect:
                reply = future.result(timeout=timeout + 5)
                assert reply.get('transportExit') == 28
                time.sleep(.3)
            decision = self.api('/api/v1/approvals/requests/' + row['id'] + '/decide', self.state['admin']['token'],
                                {'approved': approve}) if approve is not None else None
            if not disconnect:
                reply = future.result(timeout=timeout + 5)
            time.sleep(1.2)
            records = self.captures()
            result = {'name': name, 'approvalId': row['id'], 'providerCountBefore': before, 'providerCountAtBarrier': barrier,
                      'providerCountAfter': len(records), 'decision': decision, 'response': reply, 'mutation': changed,
                      'approvalPublic': row, 'approvalStoredFields': sorted(stored),
                      'fullBodyPersisted': body['article']['body_markdown'] in json.dumps(stored),
                      'exactService': stored.get('exact_service'), 'bodySha256': hashlib.sha256(json.dumps(body).encode()).hexdigest(),
                      'providerRecord': records[-1] if len(records) > before else None, 'retryWrites': 0}
            self.evidence['cases'].append(result)
            self.save()
            print(name + ': provider ' + str(before) + ' -> ' + str(barrier) + ' -> ' + str(len(records)), flush=True)
        if restore:
            restore()

    def tests(self):
        a, m = self.state['admin']['token'], self.state['member']['token']
        retained = self.mint()
        claims = json.loads(base64.urlsafe_b64decode(retained.split('.')[1] + '=='))
        self.evidence['signedOriginClaims'] = {k: claims[k] for k in ['iss', 'aud', 'sub', 'iat', 'exp', 'scope', 'delegation_origin', 'act', 'delegated']}
        self.evidence['operationCatalogForServiceOrigin'] = self.api('/api/v1/delegation/operation-catalog', retained)
        self.case('approved_baseline')
        self.mongo('db.notification_channels.updateMany({},{$set:{approval_timeout_secs:8}})')
        self.case('membership_revoked_while_pending',
                  lambda _: self.api('/api/v1/orgs/' + self.org + '/members/' + self.state['member']['id'], a, method='DELETE'),
                  lambda: self.good('/api/v1/orgs/' + self.org + '/members', a, {'user_id': self.state['member']['id'], 'role': 'member'}))
        self.case('connection_disabled_while_pending',
                  lambda _: self.api('/api/v1/user-services/' + self.pid, a, {'is_active': False}, 'PUT'),
                  lambda: self.good('/api/v1/user-services/' + self.pid, a, {'is_active': True}, 'PUT'))
        self.case('connection_rebound_while_pending',
                  lambda _: self.api('/api/v1/keys/' + self.pid, a, {'endpoint_url': 'http://' + self.provider + ':8080/rebound'}, 'PUT'),
                  lambda: self.good('/api/v1/keys/' + self.pid, a, {'endpoint_url': 'http://' + self.provider + ':8080'}, 'PUT'))
        self.case('rejected', approve=False)
        self.case('expired_native_timeout', approve=None)
        self.case('unsupported_request_cancel_then_approve',
                  lambda row: self.api('/api/v1/approvals/requests/' + row['id'], a, method='DELETE'))
        self.case('client_disconnect_before_admin_approval', timeout=2, disconnect=True)
        self.case('response_lost_after_provider_received', timeout=2)
        key = self.good('/api/v1/api-keys', m, {'name': 'M0 disposable source', 'scopes': 'proxy', 'allow_all_services': True, 'never_expires': True})
        delegated = self.mint(key['full_key'])
        before = self.introspect(delegated)
        deletion = self.api('/api/v1/api-keys/' + key['id'], m, method='DELETE')
        after = self.introspect(delegated)
        next_request = self.api('/api/v1/proxy/s/m0-cms/mint', key['full_key'])
        self.evidence['sourceKeyDelete'] = {'before': before, 'delete': deletion, 'after': after, 'newRequest': next_request}
        revoke = self.api('/oauth/revoke', body={'client_id': self.state['client']['client_id'], 'token': delegated}, form=True)
        self.evidence['serviceTokenRevocationEndpoint'] = {'revoke': revoke, 'after': self.introspect(delegated),
                                                         'status': 'NOT_SUPPORTED_FOR_SERVICE_ORIGIN_ACCESS_TOKEN',
                                                         'note': 'HTTP 200 is not evidence of service-token revocation'}
        if self.args.wait_expiry:
            # Native verifier has a 60-second leeway; CMS must still enforce exp strictly.
            while time.time() < claims['exp'] + 62:
                print('Waiting for official retained-token expiry; no writes are retried.', flush=True)
                time.sleep(min(30, claims['exp'] + 62 - time.time()))
            self.evidence['credentialExpired'] = {'secondsAfterExp': time.time() - claims['exp'], 'result': self.introspect(retained)}
        else:
            self.evidence['credentialExpired'] = {'status': 'NOT_EXERCISED', 'rerun': '--wait-expiry'}
        expected = [1, 1, 1, 1, 0, 0, 1, 0, 1]
        actual = [case['providerCountAfter'] - case['providerCountBefore'] for case in self.evidence['cases']]
        assert actual == expected, 'Observed official behavior changed; review evidence before assigning a verdict'
        for index in [1, 2, 3]:
            assert 200 <= self.evidence['cases'][index]['mutation']['http'] < 300
        assert self.evidence['cases'][6]['mutation']['http'] == 405
        assert all(not case['fullBodyPersisted'] and case['exactService'] is None for case in self.evidence['cases'])
        assert before['body']['active'] is True and after['body']['active'] is True and next_request['http'] == 401
        if self.args.wait_expiry:
            assert self.evidence['credentialExpired']['result']['body']['active'] is False
        self.evidence['observationChecks'] = {'expectedProviderDeltas': expected, 'actualProviderDeltas': actual,
                                             'sourceKeyDeleteSemantics': True, 'fullBodyAbsent': True}
        self.evidence['verdict'] = 'BLOCKED_NATIVE_ORGANIZATION_EGRESS_AND_FULL_CONTENT_APPROVAL'
        self.save()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, help='New local evidence directory; never reuse a live directory')
    parser.add_argument('--docker-context', default='colima-blogsystem')
    parser.add_argument('--node-image', default='blogsystem-review-runtime:node24-chromium-20261029')
    parser.add_argument('--wait-expiry', action='store_true')
    args = parser.parse_args()
    probe = Probe(args)
    try:
        probe.setup()
        probe.fixture()
        probe.tests()
        print('Evidence: ' + str(probe.output / 'result.json'))
    except Exception as error:
        probe.evidence['failure'] = str(error)
        probe.save()
        raise
    finally:
        # Stop only containers this invocation created. Leave recoverable evidence.
        for name in [probe.backend, probe.provider, probe.mongo_name]:
            subprocess.run(probe.docker + ['stop', '-t', '3', name], capture_output=True)


if __name__ == '__main__':
    main()
