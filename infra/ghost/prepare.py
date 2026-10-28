"""Prepare private, digest-pinned settings for the local two-site experiment."""

import argparse
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import uuid


def port(value: str) -> int:
    number = int(value)
    if not 1024 <= number <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1024 and 65535")
    return number


def resolve_image(reference: str, repository: str) -> str:
    # Only official images for this experiment. Do not execute arbitrary images.
    normalized = reference.removeprefix("docker.io/library/")
    if not re.fullmatch(rf"{repository}(?::[\w.-]+)?(?:@sha256:[a-f0-9]{{64}})?", normalized):
        raise ValueError(f"expected an official {repository} image reference")
    result = subprocess.run(
        ["docker", "image", "inspect", reference, "--format", "{{json .RepoDigests}}"],
        capture_output=True, text=True, check=True, timeout=30,
    )
    for digest in json.loads(result.stdout) or []:
        normalized_digest = digest.removeprefix("docker.io/library/")
        if re.fullmatch(rf"{repository}@sha256:[a-f0-9]{{64}}", normalized_digest):
            return normalized_digest
    raise ValueError(f"pull the official {repository} image before preparing settings")


def write_private_file(path: Path, content: str) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
        stream.write(content)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ghost-image", required=True)
    parser.add_argument("--mysql-image", required=True)
    parser.add_argument("--en-port", type=port, default=2468)
    parser.add_argument("--zh-port", type=port, default=2469)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name(".env"))
    args = parser.parse_args()
    if args.en_port == args.zh_port:
        parser.error("language sites must use different ports")
    if args.output.exists():
        raise FileExistsError("settings already exist; preserve them for existing volumes")
    values = {
        "GHOST_IMAGE": resolve_image(args.ghost_image, "ghost"),
        "MYSQL_IMAGE": resolve_image(args.mysql_image, "mysql"),
        "GHOST_EN_PORT": str(args.en_port),
        "GHOST_ZH_PORT": str(args.zh_port),
        "GHOST_EN_URL": f"http://localhost:{args.en_port}",
        "GHOST_ZH_URL": f"http://localhost:{args.zh_port}",
        "DATABASE_USER": "ghost",
    }
    for language in ("EN", "ZH"):
        for suffix in ("PASSWORD", "ROOT_PASSWORD"):
            values[f"DATABASE_{language}_{suffix}"] = secrets.token_hex(32)
    write_private_file(args.output, "".join(f"{key}={value}\n" for key, value in values.items()))
    print(f"Prepared {args.output}; credentials were not printed.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        trace_id = str(uuid.uuid4())
        # Do not print subprocess stdout/stderr: it may contain sensitive settings.
        print(f"Preparation failed ({type(error).__name__}); trace_id={trace_id}. "
              "Check Docker, image references, output permissions, and existing settings.", file=sys.stderr)
        sys.exit(1)
