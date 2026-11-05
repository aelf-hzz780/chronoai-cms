#!/usr/bin/env python3
"""Prepare and manage only isolated official-NyxID/Ghost fixtures. No live accounts."""
import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import urllib.error
import urllib.parse
import urllib.request


def request(base, path, token=None, body=None, method=None, opener=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if '/ghost/' in path:
        headers.update({'Origin': base, 'Accept-Version': 'v6.0'})
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers=headers, method=method)
    try:
        with (opener.open(req, timeout=30) if opener else urllib.request.urlopen(req, timeout=30)) as response:
            data = response.read()
            return json.loads(data) if data and 'json' in response.headers.get('Content-Type', '') else (data.decode() if data else None)
    except urllib.error.HTTPError as error:
        raise RuntimeError('Fixture API failure: ' + path + ' HTTP ' + str(error.code)) from None


def save_private(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.chmod(0o600)
    os.replace(temporary, path)


def ghost(base, kind, private):
    parsed = urllib.parse.urlparse(base)
    assert parsed.hostname in ['localhost', '127.0.0.1'] and parsed.scheme == 'http' and parsed.port
    assert parsed.port not in [2468, 2469, 3468, 3469, 3478, 3479], 'Existing Ghost sites are forbidden fixtures'
    login_path = private / ('ghost-' + kind + '-login.json')
    if login_path.exists():
        login = json.loads(login_path.read_text())
        email, password = login['email'], login['password']
    else:
        email, password = 'm0-' + kind + '@example.test', secrets.token_urlsafe(24)
        save_private(login_path, {'email': email, 'password': password})
    if not request(base, '/ghost/api/admin/authentication/setup/')['setup'][0]['status']:
        request(base, '/ghost/api/admin/authentication/setup/', body={'setup': [{'name': 'M0 ' + kind, 'email': email,
                'password': password, 'blogTitle': 'Native NyxID M0 ' + kind}]})
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    request(base, '/ghost/api/admin/session/', body={'username': email, 'password': password}, opener=opener)
    path = private / ('ghost-' + kind + '-key.json')
    if not path.exists():
        integrations = request(base, '/ghost/api/admin/integrations/', body={'integrations': [{'name': 'Native NyxID CMS probe'}]}, opener=opener)
        integration = integrations['integrations'][0]
        key = next(key for key in integration['api_keys'] if key['type'] == 'admin')
        secret = key['secret']
        if ':' in secret:
            assert secret.split(':', 1)[0] == key['id']
        else:
            secret = key['id'] + ':' + secret
        save_private(path, {'key': secret})
    users = request(base, '/ghost/api/admin/users/?include=roles', opener=opener)['users']
    author = next(user for user in users if user.get('email') == email)
    save_private(private / ('ghost-' + kind + '-login.json'), {'email': email, 'password': password})
    return {'url': base, 'adminKeyPath': str(path), 'authorId': author['id']}


def setup(args):
    directory = Path(args.directory).resolve()
    if args.resume:
        private = directory / 'private'
        original = json.loads(Path(args.m0_state).read_text())
        state = json.loads((private / 'fixture.json').read_text())
        finish(args, directory, private, original, state, state['cms'])
        return
    directory.mkdir(parents=True, exist_ok=False)
    private = directory / 'private'
    private.mkdir(mode=0o700)
    original = json.loads(Path(args.m0_state).read_text())
    base = args.nyxid_url
    parsed = urllib.parse.urlparse(base)
    assert parsed.scheme == 'http' and parsed.hostname in ['localhost', '127.0.0.1'] and parsed.port
    assert parsed.port not in [3000, 3001, 3003, 3457, 3458, 37018, 27019], 'Live and shared endpoints are forbidden fixtures'
    health = request(base, '/health')
    assert health['commit'] == '38bae2f7825b'
    state = {'nyxidUrl': base, 'admin': original['admin'], 'client': original['client'], 'org': original['org'],
             'cmsPort': args.cms_port, 'actors': {}, 'cmsRelayUrl': 'http://' + args.relay_name + ':39017'}
    # New human/org fixture avoids reusing an expired first-party setup session.
    admin_password = secrets.token_urlsafe(24)
    admin_email = 'ghost-admin-' + secrets.token_hex(4) + '@example.test'
    admin_user = request(base, '/api/v1/auth/register', body={'email': admin_email, 'password': admin_password, 'display_name': 'Ghost Admin'})
    admin_login = request(base, '/api/v1/auth/login', body={'email': admin_email, 'password': admin_password, 'client': 'token'})
    admin = admin_login['access_token']
    state['admin'] = {'id': admin_user['user_id'], 'token': admin, 'email': admin_email, 'password': admin_password}
    state['org'] = request(base, '/api/v1/orgs', admin, {'display_name': 'CMS Ghost Official Chain'})
    for name in ['personal', 'publisher', 'member']:
        password = secrets.token_urlsafe(24)
        email = 'ghost-' + name + '-' + secrets.token_hex(4) + '@example.test'
        user = request(base, '/api/v1/auth/register', body={'email': email, 'password': password, 'display_name': 'Ghost ' + name})
        login = request(base, '/api/v1/auth/login', body={'email': email, 'password': password, 'client': 'token'})
        request(base, '/api/v1/orgs/' + state['org']['id'] + '/members', admin, {'user_id': user['user_id'], 'role': 'member'})
        state['actors'][name] = {'subject': user['user_id'], 'token': login['access_token']}
    state['actors']['admin'] = {'subject': state['admin']['id'], 'token': admin}
    cms = request(base, '/api/v1/keys', admin, {'label': 'M0 CMS Ghost chain', 'slug': 'm0-cms-ghost',
          'endpoint_url': state['cmsRelayUrl'], 'auth_method': 'none', 'target_org_id': state['org']['id'],
          'identity_propagation_mode': 'jwt', 'identity_jwt_audience': 'm0-cms-ghost',
          'inject_delegation_token': True, 'delegation_token_scope': 'account:read proxy:*'})
    state['cms'] = cms
    request(base, '/api/v1/approvals/service-configs/' + cms['id'] + '?org_id=' + state['org']['id'], admin,
            {'approval_required': False, 'default_effect': 'auto_allow'}, 'PUT')
    actors = {}
    for name, value in state['actors'].items():
        key = request(base, '/api/v1/api-keys', value['token'], {'name': 'Ghost isolated ' + name,
                      'scopes': 'proxy', 'allow_all_services': True, 'never_expires': True})
        path = private / (name + '-agent-key.json')
        save_private(path, {'key': key['full_key']})
        actors[name] = {'subject': value['subject'], 'agentKeyPath': str(path)}
    statepath = private / 'fixture.json'
    save_private(statepath, state)
    finish(args, directory, private, original, state, cms)


def finish(args, directory, private, original, state, cms):
    statepath = private / 'fixture.json'
    base = state['nyxidUrl']
    actors = {name: {'subject': value['subject'], 'agentKeyPath': str(private / (name + '-agent-key.json'))} for name, value in state['actors'].items()}
    ghost_sites = {name: ghost(url, name, private) for name, url in [('personal', args.personal_ghost), ('organization', args.organization_ghost)]}
    helper = str(Path(__file__).resolve())
    scopes = {k: ['account:read', 'proxy:*'] for k in ['content:write', 'publish', 'roles:write']}
    scopes.update({'content:read': ['account:read'], 'connections:read': ['account:read']})
    manifest = {'officialCommit': '38bae2f7825bfa70d8a9e4e837118d7d9658e6a5', 'cmsCommit': args.cms_commit,
                'env': {'PUBLIC_URL': 'http://127.0.0.1:' + str(args.cms_port), 'ALLOW_LOOPBACK_HTTP': 'true',
                        'NYXID_ISSUER': 'http://localhost:3001', 'NYXID_API_URL': base,
                        'NYXID_DISCOVERY_URL': base + '/.well-known/openid-configuration',
                        'NYXID_CLIENT_ID': original['client']['client_id'], 'NYXID_CMS_AUDIENCE': 'http://localhost:33013',
                        'NYXID_TOKEN_AUDIENCE': 'http://localhost:33013', 'NYXID_SERVICE_AUDIENCE': 'm0-cms-ghost', 'NYXID_SERVICE_ID': cms['id'], 'NYXID_SERVICE_SLUG': cms['slug'],
                        'NYXID_INTROSPECTION_URL': base + '/oauth/introspect',
                        'NYXID_SERVICE_CAPABILITY_SCOPES_JSON': json.dumps(scopes)},
                'organizationId': state['org']['id'], 'actors': actors, 'ghost': {'sites': ghost_sites},
                'ingress': {'mode': 'official-proxy', 'apiBase': base + '/api/v1/proxy/s/' + cms['slug'],
                            'listenHost': '127.0.0.1', 'listenPort': args.cms_port,
                            'configureCommand': {'executable': 'python3', 'args': [helper, 'configure-endpoint', str(statepath)]}},
                'membershipCommands': {'remove': {'executable': 'python3', 'args': [helper, 'remove-member', str(statepath)]},
                                       'restore': {'executable': 'python3', 'args': [helper, 'restore-member', str(statepath)]}},
                'renderEnv': {'RENDER_ASSET_ORIGINS': 'https://cdn.jsdelivr.net'}}
    save_private(directory / 'manifest.json', manifest)
    print('Created isolated fixtures: ' + str(directory / 'manifest.json'))


def manage(action, statefile, value):
    state = json.loads(Path(statefile).read_text())
    base = state['nyxidUrl']
    # Only the isolated human fixture's control-plane session is renewed.
    # This never replaces credentials frozen into CMS queue records.
    login = request(base, '/api/v1/auth/login', body={'email': state['admin']['email'],
                    'password': state['admin']['password'], 'client': 'token'})
    admin = login['access_token']
    if action == 'configure-endpoint':
        parsed = urllib.parse.urlparse(value)
        assert parsed.hostname in ['localhost', '127.0.0.1'] and parsed.port == state['cmsPort']
        request(base, '/api/v1/keys/' + state['cms']['id'], admin, {'endpoint_url': state['cmsRelayUrl']}, 'PUT')
    else:
        assert value in [v['subject'] for v in state['actors'].values()] and value != state['admin']['id']
        path = '/api/v1/orgs/' + state['org']['id'] + '/members'
        if action == 'remove-member':
            request(base, path + '/' + value, admin, method='DELETE')
        else:
            request(base, path, admin, {'user_id': value, 'role': 'member'})
    print('Isolated fixture action complete: ' + action)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    start = commands.add_parser('setup')
    start.add_argument('--resume', action='store_true')
    for flag in ['m0-state', 'directory', 'personal-ghost', 'organization-ghost', 'cms-commit']:
        start.add_argument('--' + flag, required=True)
    start.add_argument('--nyxid-url', default='http://localhost:33013')
    start.add_argument('--cms-port', type=int, default=33317)
    start.add_argument('--relay-name', default='nyxid-m0-ghost-relay')
    for name in ['configure-endpoint', 'remove-member', 'restore-member']:
        command = commands.add_parser(name)
        command.add_argument('statefile')
        command.add_argument('value')
    args = parser.parse_args()
    if args.action == 'setup':
        setup(args)
    else:
        manage(args.action, args.statefile, args.value)
