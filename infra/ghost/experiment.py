"""Local-only Ghost integration experiment; never a production auth client."""

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import hmac
import http.cookiejar
import json
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise ValueError("redirects are not allowed in the local credentialed experiment")


def local_url(value):
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in {"", "/"} or not parsed.port):
        raise ValueError("experiment targets must be explicit loopback HTTP origins")
    return value.rstrip("/")


def save_state(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                     delete=False) as stream:
        os.chmod(stream.name, 0o600)
        json.dump(value, stream, ensure_ascii=False)
        temporary = stream.name
    os.replace(temporary, path)


def encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def integration_token(key):
    if not re.fullmatch(r"[a-f0-9]{24}:[a-f0-9]{64}", key):
        raise ValueError("unexpected Admin API key format")
    identifier, secret = key.split(":", 1)
    now = int(time.time())
    header = encode(json.dumps({"alg": "HS256", "typ": "JWT", "kid": identifier}).encode())
    payload = encode(json.dumps({"iat": now, "exp": now + 120, "aud": "/admin/"}).encode())
    content = f"{header}.{payload}"
    signature = hmac.new(bytes.fromhex(secret), content.encode(), hashlib.sha256).digest()
    return f"{content}.{encode(signature)}"


def client():
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({}), NoRedirect(),
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
    )


def request(opener, origin, path, method="GET", payload=None, key=None):
    headers = {"Origin": origin, "Accept-Version": "v6.0", "Accept": "application/json"}
    if key:
        headers["Authorization"] = "Ghost " + integration_token(key)
    data = None if payload is None else json.dumps(payload).encode()
    if data:
        headers["Content-Type"] = "application/json"
    operation = urllib.request.Request(origin + path, data=data, headers=headers, method=method)
    with opener.open(operation, timeout=30) as response:
        body = response.read(2_000_001)
        if len(body) > 2_000_000:
            raise ValueError("response exceeded experiment limit")
        return response.status, body


def json_request(*args, **kwargs):
    _, data = request(*args, **kwargs)
    return json.loads(data) if data else {}


def initialize_site(opener, site, language, checkpoint):
    origin = site["url"]
    if "key" in site:
        return
    status = json_request(opener, origin, "/ghost/api/admin/authentication/setup/")
    # Operator-only, disposable bootstrap. These setup/settings endpoints are
    # version-bound Admin UI interfaces, not our proposed production Adapter.
    if not status["setup"][0]["status"]:
        owner = json_request(opener, origin, "/ghost/api/admin/authentication/setup/", "POST", {
            "setup": [{"name": "BlogSystem Local Operator", "email": site["email"],
                       "password": site["password"], "blogTitle": f"BlogSystem Local {language}"}]
        })["users"][0]
        site["owner_id"] = owner["id"]
        checkpoint()
    # Ghost's session endpoint may return a plain-text 201 body.
    request(opener, origin, "/ghost/api/admin/session/", "POST", {
        "username": site["email"], "password": site["password"]})
    if "owner_id" not in site:
        site["owner_id"] = json_request(opener, origin, "/ghost/api/admin/users/me/")["users"][0]["id"]
        checkpoint()
    json_request(opener, origin, "/ghost/api/admin/settings/", "PUT", {
        "settings": [{"key": "locale", "value": language}]})
    integration = json_request(opener, origin, "/ghost/api/admin/integrations/", "POST", {
        "integrations": [{"name": "BlogSystem Local Experiment"}]
    })["integrations"][0]
    admin = next(key for key in integration["api_keys"] if key["type"] == "admin")
    raw = admin["secret"]
    site["key"] = raw if raw.startswith(admin["id"] + ":") else admin["id"] + ":" + raw
    integration_token(site["key"])
    checkpoint()


def publish_fixture(opener, site, language, run_id, checkpoint):
    marker = f"BlogSystem {language} {run_id} 原文发布验证"
    fixture = (f"<h2>{marker}</h2><p>English and 简体中文.</p>"
               '<pre><code class="language-typescript">const value = 42;</code></pre>'
               "<table><thead><tr><th>Language</th><th>Value</th></tr></thead>"
               f"<tbody><tr><td>{language}</td><td>42</td></tr></tbody></table>")
    slug = f"phase0-{language}-{run_id}"
    if site.get("post_request_dispatched"):
        query = urllib.parse.urlencode({"filter": f"slug:{slug}", "formats": "html"})
        matches = json_request(opener, site["url"], "/ghost/api/admin/posts/?" + query,
                               key=site["key"])["posts"]
        if len(matches) != 1 or matches[0]["title"] != marker or marker not in matches[0]["html"]:
            raise ValueError("uncertain post creation requires manual reconciliation; not retrying")
        post = matches[0]
    else:
        site["post_request_dispatched"] = True
        checkpoint()
        post = json_request(opener, site["url"], "/ghost/api/admin/posts/?source=html", "POST", {
            "posts": [{"title": marker, "slug": slug,
                       "html": "<!--kg-card-begin: html-->" + fixture + "<!--kg-card-end: html-->",
                       "status": "published", "authors": [site["owner_id"]]}]
        }, key=site["key"])["posts"][0]
    site["post"] = {"id": post["id"], "slug": post["slug"], "url": post["url"],
                    "marker": marker, "fixture_sha256": hashlib.sha256(fixture.encode()).hexdigest()}


def verify_site(opener, site, language, other_url):
    post = json_request(opener, site["url"], f'/ghost/api/admin/posts/{site["post"]["id"]}/?formats=html',
                        key=site["key"])["posts"][0]
    assert post["status"] == "published"
    assert post["authors"][0]["id"] == site["owner_id"]
    path = urllib.parse.urlsplit(site["post"]["url"]).path
    _, body = request(opener, site["url"], path)
    html = body.decode()
    for marker in [site["post"]["marker"], "<table", "<code", f'lang="{language}"']:
        assert marker in html, f"missing expected rendered marker: {marker}"
    request(opener, site["url"], "/sitemap.xml")
    try:
        request(opener, other_url, path)
    except urllib.error.HTTPError as error:
        assert error.code == 404, "unexpected cross-site response"
    else:
        raise AssertionError("fixture unexpectedly visible on the other language site")
    return {"language": language, "url": site["post"]["url"], "published": True,
            "author_verified": True, "html_language_verified": True,
            "code_and_table_rendered": True, "sitemap_accessible": True,
            "other_site_returns_404": True, "fixture_sha256": site["post"]["fixture_sha256"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--initialize", action="store_true", help="creates local operators and test posts")
    mode.add_argument("--resume", action="store_true", help="resumes a partial local experiment using saved credentials")
    mode.add_argument("--verify", action="store_true", help="read-only check, including after restart")
    parser.add_argument("--en-url", default="http://localhost:2468")
    parser.add_argument("--zh-url", default="http://localhost:2469")
    parser.add_argument("--state", type=Path, default=Path(__file__).resolve().parents[2] / ".runtime/ghost-experiment.json")
    args = parser.parse_args()
    origins = {"en": local_url(args.en_url), "zh": local_url(args.zh_url)}
    if origins["en"] == origins["zh"]:
        raise ValueError("two distinct language sites are required")
    if args.initialize:
        if args.state.exists():
            raise ValueError("state already exists; refusing to reinitialize")
        state = {"run_id": uuid.uuid4().hex[:12], "sites": {
            language: {"url": url, "password": secrets.token_urlsafe(36),
                       "email": f"ghost-{language}@blogsystem.invalid"}
            for language, url in origins.items()}}
        save_state(args.state, state)
    else:
        state = json.loads(args.state.read_text())
    if set(state["sites"]) != {"en", "zh"}:
        raise ValueError("state must contain exactly the two language sites")
    for language, site in state["sites"].items():
        if local_url(site["url"]) != origins[language]:
            raise ValueError("saved state does not match the selected local origins")
    if args.initialize or args.resume:
        for language, site in state["sites"].items():
            opener = client()
            initialize_site(opener, site, language, lambda: save_state(args.state, state))
            if "post" not in site:
                publish_fixture(opener, site, language, state["run_id"], lambda: save_state(args.state, state))
                save_state(args.state, state)
    results = [verify_site(client(), site, language, origins["zh" if language == "en" else "en"])
               for language, site in state["sites"].items()]
    print(json.dumps({"status": "passed", "evidence_level": "local", "run_id": state["run_id"],
                      "performed_at": datetime.now(timezone.utc).isoformat(),
                      "mode": "initialize" if args.initialize else "resume" if args.resume else "verify", "sites": results}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never print requests, tokens, cookies, passwords or response bodies.
        status = error.code if isinstance(error, urllib.error.HTTPError) else None
        print(json.dumps({"status": "failed", "error_type": type(error).__name__,
                          "http_status": status, "trace_id": str(uuid.uuid4())}), file=sys.stderr)
        sys.exit(1)
