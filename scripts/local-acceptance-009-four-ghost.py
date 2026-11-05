#!/usr/bin/env python3
"""Isolated four-Ghost/media/restore replay; only resources created by this run."""
import hashlib
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('LOCAL_ACCEPTANCE_OUTPUT', str(ROOT / '.runtime/local-acceptance-20261105/runtime'))).resolve()
OUT.mkdir(parents=True, exist_ok=True, mode=0o700)
REUSE = os.environ.get('LOCAL_ACCEPTANCE_REUSE_RUN')
RUN = REUSE or ('009-' + uuid.uuid4().hex[:8])
assert len(RUN) == 12 and RUN.startswith('009-') and all(c in '0123456789abcdef' for c in RUN[4:])
DIR = OUT / RUN
if REUSE:
    old = json.loads((DIR / 'result.json').read_text())
    assert old['runId'] == RUN and old['status'] == 'FAIL'
    shutil.copyfile(DIR / 'result.json', DIR / ('result-failed-' + str(time.time_ns()) + '.json'))
    shutil.copyfile(DIR / 'commands.log', DIR / ('commands-failed-' + str(time.time_ns()) + '.log'))
else:
    DIR.mkdir(mode=0o700)
CONTEXT = 'colima-blogsystem'
IMAGE = 'blogsystem-review-runtime:node24-chromium-20261029'
GHOST = 'ghost@sha256:4195f6c405e40230cd10c0770425cf500c1f542a96e9f6584c11649c150e5a89'
MYSQL = 'mysql@sha256:f37951fc3753a6a22d6c7bf6978c5e5fefcf6f31814d98c582524f98eae52b21'
COMPOSE = ROOT / 'infra/ghost/compose.yaml'
PROJECTS = {owner: 'blogsystem-local-' + RUN + '-' + owner for owner in ['personal', 'organization']}
RESTORES = {owner: 'blogsystem-restore-' + RUN + '-' + owner for owner in PROJECTS}
PORTS = {'personal': [33568, 33569], 'organization': [33578, 33579]}
RESTORE_PORTS = {'personal': [33668, 33669], 'organization': [33678, 33679]}
HELPER = 'blogsystem-local-' + RUN + '-helper'
REPORT = {'runId': RUN, 'status': 'RUNNING', 'startedAt': time.time(), 'dockerContext': CONTEXT,
          'sourceProjects': PROJECTS, 'restoreProjects': RESTORES, 'sourcePorts': PORTS,
          'restorePorts': RESTORE_PORTS, 'authority': 'synthetic local authority; separate native NyxID replay',
          'protectedServicesModified': False, 'thirdPartyWrites': 0, 'stages': []}
LOG = (DIR / 'commands.log').open('w')


def save():
    (DIR / 'result.json').write_text(json.dumps(REPORT, indent=2) + '\n')


def run(args, capture=False, env=None, timeout=240, cwd=ROOT):
    result = subprocess.run([str(x) for x in args], cwd=cwd, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        diagnostic = result.stderr
        for path in DIR.glob('*.env'):
            for line in path.read_text().splitlines():
                name, value = line.split('=', 1)
                if 'PASSWORD' in name:
                    diagnostic = diagnostic.replace(value, '[REDACTED]')
        for name in ['RECOVERY_BACKUP_KEY']:
            value = (env or {}).get(name)
            if value:
                diagnostic = diagnostic.replace(value, '[REDACTED]')
        LOG.write('FAILED ' + str(args[0]) + ': ' + diagnostic[:3000] + '\n')
        LOG.flush()
        raise RuntimeError('Command failed: ' + str(args[0]) + ' exit ' + str(result.returncode) + '; sanitized diagnostic in commands.log')
    if not capture:
        LOG.write(result.stdout)
        LOG.flush()
    return result.stdout


def docker(*args, **kw):
    return run(['docker', '--context', CONTEXT, *args], **kw)


def compose(owner, *args, restore=False, **kw):
    env_file = DIR / (owner + '.env')
    project = RESTORES[owner] if restore else PROJECTS[owner]
    if restore:
        env_file = DIR / 'restored' / ('ghost-' + str(list(PROJECTS).index(owner)) + '.env')
    return docker('compose', '--env-file', env_file, '-f', COMPOSE,
                  '-f', DIR / 'limits.json', '-p', project, *args, **kw)


def stage(name):
    REPORT['stages'].append({'name': name, 'at': time.time()})
    save()
    print(json.dumps({'stage': name, 'run': RUN}), flush=True)


def healthy(owner, service):
    for _ in range(90):
        ids = compose(owner, 'ps', '-q', service, capture=True).strip()
        if ids and docker('inspect', '--format', '{{.State.Health.Status}}', ids, capture=True).strip() == 'healthy':
            return
        time.sleep(2)
    raise RuntimeError('New fixture health timeout: ' + owner + '/' + service)


def check_port(port):
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', port))


def isolated_networks(project):
    ids = docker('network', 'ls', '-q', capture=True).split()
    existing = json.loads(docker('network', 'inspect', *ids, capture=True))
    used = [ipaddress.ip_network(item['Subnet']) for row in existing
            for item in (row.get('IPAM', {}).get('Config') or []) if item.get('Subnet')]
    for lang in ['en', 'zh']:
        present = next((row for row in existing if row['Name'] == project + '_' + lang), None)
        if present:
            assert REUSE and present['Labels']['com.docker.compose.project'] == project
            continue
        subnet = next(ipaddress.ip_network('10.234.' + str(index) + '.0/28') for index in range(80, 250)
                      if not any(ipaddress.ip_network('10.234.' + str(index) + '.0/28').overlaps(old) for old in used))
        docker('network', 'create', '--subnet', str(subnet), '--label', 'com.docker.compose.project=' + project,
               '--label', 'com.docker.compose.network=' + lang, project + '_' + lang)
        used.append(subnet)


def bootstrap(owner):
    spec = importlib.util.spec_from_file_location('ghost_fixture', ROOT / 'infra/ghost/experiment.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    state = {'run_id': RUN, 'sites': {lang: {'url': 'http://localhost:' + str(PORTS[owner][index]),
             'password': secrets.token_urlsafe(36), 'email': 'local-' + owner + '-' + lang + '@example.test'}
             for index, lang in enumerate(['en', 'zh'])}}
    path = DIR / ('dev-' + owner + '-state.json')
    if path.exists():
        assert REUSE
        saved = json.loads(path.read_text())
        assert all(saved['sites'][lang]['url'] == state['sites'][lang]['url'] and saved['sites'][lang].get('key') for lang in ['en', 'zh'])
        return
    module.save_state(path, state)
    for lang, site in state['sites'].items():
        module.initialize_site(module.client(), site, lang, lambda: module.save_state(path, state))
    module.save_state(path, state)


def container_evidence(names):
    if not names:
        return []
    rows = json.loads(docker('inspect', *names, capture=True))
    return [{'name': row['Name'], 'state': {key: row['State'].get(key) for key in
             ['Status', 'ExitCode', 'OOMKilled', 'StartedAt', 'FinishedAt']},
             'restartCount': row['RestartCount'], 'memoryLimit': row['HostConfig']['Memory']}
            for row in rows]


try:
    REPORT['commit'] = run(['git', 'rev-parse', 'HEAD'], capture=True).strip()
    for port in sum(PORTS.values(), []) + sum(RESTORE_PORTS.values(), []):
        check_port(port)
    for image in [GHOST, MYSQL, IMAGE]:
        docker('image', 'inspect', image, capture=True)
    limits = {'services': {name: {'mem_limit': '256m', 'restart': 'no',
                                **({'command': ['--performance-schema=OFF', '--innodb-buffer-pool-size=32M', '--max-connections=20']} if name.startswith('db-') else {})}
                          for name in ['db-en', 'db-zh', 'ghost-en', 'ghost-zh']}}
    (DIR / 'limits.json').write_text(json.dumps(limits))
    for owner in PROJECTS:
        values = {'GHOST_IMAGE': GHOST, 'MYSQL_IMAGE': MYSQL, 'DATABASE_USER': 'ghost'}
        for index, lang in enumerate(['EN', 'ZH']):
            values['GHOST_' + lang + '_PORT'] = str(PORTS[owner][index])
            values['GHOST_' + lang + '_URL'] = 'http://localhost:' + str(PORTS[owner][index])
            values['DATABASE_' + lang + '_PASSWORD'] = secrets.token_hex(32)
            values['DATABASE_' + lang + '_ROOT_PASSWORD'] = secrets.token_hex(32)
        env_file = DIR / (owner + '.env')
        if not env_file.exists():
            env_file.write_text(''.join(k + '=' + v + '\n' for k, v in values.items()))
            env_file.chmod(0o600)
        existing_ids = compose(owner, 'ps', '-a', '-q', capture=True).split()
        assert REUSE or not existing_ids
        for container in existing_ids:
            details = json.loads(docker('inspect', container, capture=True))[0]
            assert not details['State']['Running'] and details['Config']['Labels']['com.docker.compose.project'] == PROJECTS[owner]
        isolated_networks(PROJECTS[owner])
        stage('start-' + owner)
        for lang in ['en', 'zh']:
            compose(owner, 'up', '-d', '--pull', 'never', 'db-' + lang, 'ghost-' + lang)
            healthy(owner, 'ghost-' + lang)
        bootstrap(owner)
    stage('four-ghost-http-media')
    REPORT['packagedCommit'] = run(['git', 'rev-parse', 'HEAD'], capture=True).strip()
    staging = DIR / 'staging'
    (staging / '.runtime').mkdir(parents=True, exist_ok=bool(REUSE))
    for owner in PROJECTS:
        (staging / '.runtime' / ('dev-' + owner + '-state.json')).write_bytes((DIR / ('dev-' + owner + '-state.json')).read_bytes())
    (staging / 'build.json').write_text(json.dumps({'revision': REPORT['packagedCommit'], 'dirty': True}))
    test_source = (ROOT / 'test/four-ghost.integration.ts').read_text()
    for old, new in [('2568', '33568'), ('2569', '33569'), ('2578', '33578'), ('2579', '33579')]:
        test_source = test_source.replace(old, new)
    (staging / 'four-ghost.integration.ts').write_text(test_source)
    bridge = (ROOT / 'test/ghost-container.mjs').read_text()
    bridge = bridge.replace('{mkdir,symlink,readFile,readlink}', '{mkdir,symlink,readFile,readlink,chown,chmod}')
    bridge = bridge.replace('await mkdir(privateStaging[`${owner}-${language}`],{recursive:true,mode:0o700});',
                            'await mkdir(privateStaging[`${owner}-${language}`],{recursive:true,mode:0o700});await chown(privateStaging[`${owner}-${language}`],process.getuid(),process.getgid());await chmod(privateStaging[`${owner}-${language}`],0o700);')
    for old, new in [('2568', '33568'), ('2569', '33569'), ('2578', '33578'), ('2579', '33579')]:
        bridge = bridge.replace(old, new)
    bridge = bridge.replace('`blogsystem-dev-${owner}-ghost-${language}-1`', '`' + 'blogsystem-local-' + RUN + '-${owner}-ghost-${language}-1`')
    (staging / 'ghost-container.mjs').write_text(bridge)
    archive = DIR / 'source.tgz'
    run(['tar', '-czf', archive, 'src', 'web', 'themes', 'scripts', 'test', 'node_modules', 'package.json', 'package-lock.json',
         'tsconfig.json', 'tsconfig.studio.json', '-C', staging, '.runtime', 'build.json'],
        env={**os.environ, 'COPYFILE_DISABLE': '1'}, timeout=240)
    mounts = []
    for owner, project in PROJECTS.items():
        for lang in ['en', 'zh']:
            mounts += ['--mount', 'type=volume,source=' + project + '_content-' + lang + ',target=/mounted/' + owner + '-' + lang]
    docker('create', '--name', HELPER, '--memory', '512m', '--network', PROJECTS['personal'] + '_en', *mounts,
           '--entrypoint', 'sh', IMAGE, '-c', 'mkdir -p /app && tar -xzf /tmp/source.tgz -C /app && cp /tmp/four-ghost.integration.ts /app/test/ && cp /tmp/ghost-container.mjs /app/test/ && cd /app && exec node test/ghost-container.mjs')
    for owner in PROJECTS:
        for lang in ['en', 'zh']:
            if owner != 'personal' or lang != 'en':
                docker('network', 'connect', PROJECTS[owner] + '_' + lang, HELPER)
    for src, dst in [(archive, '/tmp/source.tgz'), (staging / 'four-ghost.integration.ts', '/tmp/four-ghost.integration.ts'), (staging / 'ghost-container.mjs', '/tmp/ghost-container.mjs')]:
        docker('cp', src, HELPER + ':' + dst)
    output = docker('start', '--attach', HELPER, capture=True, timeout=300)
    REPORT['helperRuntime'] = container_evidence([HELPER])
    (DIR / 'four-ghost.log').write_text(output)
    assert docker('inspect', '--format', '{{.State.ExitCode}}', HELPER, capture=True).strip() == '0', 'Four Ghost helper failed'
    source = DIR / 'source'
    source.mkdir()
    for src, dst in [('four-ghost-evidence.json', 'evidence.json'), ('four-ghost-platform.sqlite', 'four-ghost-platform.sqlite'), ('integration-platform.env', 'integration-platform.env')]:
        docker('cp', HELPER + ':/app/.runtime/' + src, source / dst)
    docker('rm', HELPER)
    archive.unlink()
    REPORT['fourGhostEvidence'] = str(source / 'evidence.json')
    key = secrets.token_hex(32)
    (DIR / 'backup-key.private').write_text(key)
    (DIR / 'backup-key.private').chmod(0o600)
    plan = {'dockerContext': CONTEXT, 'databasePath': str(source / 'four-ghost-platform.sqlite'),
            'platformConfig': str(source / 'integration-platform.env'),
            'extraFiles': [str(DIR / ('dev-' + owner + '-state.json')) for owner in PROJECTS],
            'sites': [{'project': PROJECTS[owner], 'envFile': str(DIR / (owner + '.env')),
                       'restoreProject': RESTORES[owner], 'enPort': RESTORE_PORTS[owner][0], 'zhPort': RESTORE_PORTS[owner][1]} for owner in PROJECTS]}
    (DIR / 'plan.json').write_text(json.dumps(plan, indent=2))
    recovery_workspace = DIR / 'recovery-workspace'
    recovery_workspace.mkdir()
    for name in ['src', 'web', 'themes', 'scripts', 'test', 'infra']:
        shutil.copytree(ROOT / name, recovery_workspace / name,
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.env'))
    for name in ['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.studio.json', '.env.example']:
        shutil.copyfile(ROOT / name, recovery_workspace / name)
    (recovery_workspace / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
    compose_copy = recovery_workspace / 'infra/ghost/compose.yaml'
    compose_text = compose_copy.read_text()
    for name in ['db-en', 'db-zh', 'ghost-en', 'ghost-zh']:
        compose_text = re.sub(r'^  ' + re.escape(name) + r':\n', '  ' + name + ':\n    mem_limit: 256m\n', compose_text, flags=re.MULTILINE)
    compose_copy.write_text(compose_text)
    for owner in PROJECTS:
        docker('compose', '--env-file', DIR / (owner + '.env'), '-f', compose_copy, '-p', RESTORES[owner], 'config', '--quiet')
    # Git metadata is read-only and used only by recovery's fingerprint metadata.
    recovery_env = {**os.environ, 'RECOVERY_BACKUP_KEY': key, 'RECOVERY_ARCHIVE': str(DIR / 'backup.enc'),
                    'GIT_DIR': run(['git', 'rev-parse', '--absolute-git-dir'], capture=True).strip(), 'GIT_WORK_TREE': str(ROOT)}
    stage('capture-encrypted-backup')
    run(['node', 'scripts/recovery.ts', 'capture', DIR / 'plan.json', DIR / 'backup.enc'], env=recovery_env, timeout=300, cwd=recovery_workspace)
    stage('stop-only-current-source-projects')
    for owner in PROJECTS:
        compose(owner, 'stop', timeout=120)
    stage('restore-fresh-volumes')
    for owner in PROJECTS:
        isolated_networks(RESTORES[owner])
    run(['node', 'scripts/recovery.ts', 'restore', DIR / 'plan.json', DIR / 'restored'], env=recovery_env, timeout=600, cwd=recovery_workspace)
    REPORT['restoreMemoryLimitsVerified'] = all(
        int(docker('inspect', '--format', '{{.HostConfig.Memory}}', project + '-' + service + '-1', capture=True).strip()) == 256 * 1024 * 1024
        for project in RESTORES.values() for service in ['db-en', 'db-zh', 'ghost-en', 'ghost-zh'])
    assert REPORT['restoreMemoryLimitsVerified']
    stage('verify-restored-content')
    verifier = ROOT / 'scripts/local-acceptance-009-restore-verify.ts'
    run(['node', verifier, DIR], timeout=120)
    REPORT['status'] = 'PASS'
except Exception as error:
    REPORT['status'] = 'FAIL'
    REPORT['error'] = {'type': type(error).__name__, 'message': str(error)[:250]}
    try:
        REPORT['helperRuntime'] = container_evidence([HELPER])
        logs = docker('logs', HELPER, capture=True)
        (DIR / 'four-ghost.log').write_text(logs)
    except Exception:
        pass
    try:
        private_failure = DIR / ('failure-runtime-' + str(time.time_ns()) + '.private')
        private_failure.mkdir(mode=0o700)
        docker('cp', HELPER + ':/app/.runtime/.', private_failure)
        REPORT['privateFailureRuntime'] = str(private_failure)
    except Exception:
        REPORT['privateFailureRuntimeCaptured'] = False
finally:
    # Retain volumes/evidence, stop only exact projects first created by this run.
    helper_ids = docker('ps', '-a', '--filter', 'name=^/' + HELPER + '$', '-q', capture=True).split()
    try:
        if helper_ids:
            docker('rm', '-f', HELPER)
        REPORT['helperCleanup'] = {'existed': bool(helper_ids), 'removed': True}
    except Exception:
        REPORT['helperCleanup'] = {'existed': bool(helper_ids), 'removed': False}
        REPORT['status'] = 'FAIL'
    cleanup = []
    for owner in PROJECTS:
        for restore in [False, True]:
            try:
                project = RESTORES[owner] if restore else PROJECTS[owner]
                ids = docker('ps', '-a', '--filter', 'label=com.docker.compose.project=' + project, '-q', capture=True).split()
                before = container_evidence(ids)
                if ids:
                    docker('stop', *ids, timeout=120)
                cleanup.append({'project': project, 'createdContainerCount': len(ids), 'stopped': True,
                                'runtimeBeforeStop': before, 'runtimeAfterStop': container_evidence(ids)})
            except Exception:
                cleanup.append({'project': RESTORES[owner] if restore else PROJECTS[owner], 'stopped': False})
    REPORT['cleanup'] = cleanup
    if any(not item['stopped'] for item in cleanup):
        REPORT['status'] = 'FAIL'
        REPORT['cleanupFailed'] = True
    REPORT['finishedAt'] = time.time()
    save()
    LOG.close()
    print(json.dumps({'status': REPORT['status'], 'evidence': str(DIR / 'result.json')}), flush=True)
if REPORT['status'] != 'PASS':
    sys.exit(1)
