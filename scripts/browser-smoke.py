#!/usr/bin/env python3
"""Real-browser integration smoke test for One Minute Outside.

Requires: python-playwright, Chromium, built Vite dist. Runs the actual
browser Web Worker + ONNX model (not a mocked or keyword-based substitute).
No credentials, account actions, or external submissions.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import time
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def wait_ready(url: str, server: subprocess.Popen, seconds: int = 25) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise RuntimeError(f"Vite exited early: {server.returncode}")
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            time.sleep(0.2)
    raise TimeoutError(f"Preview did not start: {url}")


def check(page, *, mobile: bool, timeout_ms: int, screenshots: Path, url: str) -> None:
    errors = []
    failed_resources = []
    external_posts = []
    page.on("response", lambda response: failed_resources.append(f"{response.status} {response.url}") if response.status >= 400 else None)
    page.on("requestfailed", lambda request: failed_resources.append(f"requestfailed {request.url}"))
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.on("request", lambda request: external_posts.append(request.url)
            if request.method == "POST" and not request.url.startswith("http://127.0.0.1:")
            else None)
    page.goto(url, wait_until="networkidle", timeout=30000)
    assert "One Minute Outside" in page.title()
    assert not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"), "horizontal overflow"

    page.locator("#mood").fill("I am exhausted and want to listen to birds in a quiet safe place")
    page.locator("#access").select_option("seated")
    page.locator("#go").click()
    try:
        page.locator("#result").wait_for(state="visible", timeout=timeout_ms)
    except Exception as exc:
        status = page.locator("#model-status").inner_text()
        raise AssertionError(f"model result not visible; status={status!r}; page_errors={errors}; failed_resources={failed_resources}") from exc
    title = page.locator("#quest-title").inner_text()
    assert title.strip(), "empty model recommendation"
    assert page.locator("#model-status").inner_text().startswith("Ready."), "model never finished"
    assert page.locator("#quest-steps li").count() >= 2, "missing quest steps"
    page.screenshot(path=str(screenshots / ("mobile-result.png" if mobile else "desktop-result.png")), full_page=True)

    page.locator("#journal-open").click()
    page.locator("#observation").fill("Birdsong behind the leaves.")
    page.locator("#journal-form button[type=submit]").click()
    assert page.locator("#entry-count").inner_text() == "1 FIELD NOTE"
    page.reload(wait_until="networkidle")
    assert "Birdsong behind the leaves." in page.locator("#journal-list").inner_text(), "journal did not persist"
    assert not external_posts, f"unexpected outbound POST: {external_posts}"
    assert not errors, f"browser JS errors: {errors}"
    print(f"{'mobile' if mobile else 'desktop'}: real local model + journal persistence + privacy + layout OK; card={title!r}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout", type=int, default=90000, help="milliseconds to wait for first-use model")
    parser.add_argument("--url", help="test an existing public or local URL instead of starting Vite")
    parser.add_argument("--base-path", default="/", help="Vite preview base path, e.g. /one-minute-outside/ for GitHub Pages")
    args = parser.parse_args()
    chromium = os.environ.get("CHROMIUM_PATH") or shutil.which("chromium") or shutil.which("google-chrome")
    if not chromium:
        raise SystemExit("Chromium executable not found")
    screenshots = ROOT / "artifacts"
    screenshots.mkdir(exist_ok=True)
    server = None
    base_path = "/" + args.base_path.strip("/") + "/" if args.base_path.strip("/") else "/"
    url = args.url or ("http://127.0.0.1:4177" + base_path)
    if not args.url:
        server = subprocess.Popen(
            ["npm", "run", "preview", "--", "--port", "4177", "--strictPort", "--base", base_path],
            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    try:
        if server is not None:
            wait_ready(url, server)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=chromium, headless=True, args=["--no-sandbox"])
            try:
                for width, height, mobile in ((1440, 900, False), (390, 844, True)):
                    context = browser.new_context(viewport={"width": width, "height": height})
                    try:
                        check(context.new_page(), mobile=mobile, timeout_ms=args.timeout, screenshots=screenshots, url=url)
                    finally:
                        context.close()
            finally:
                browser.close()
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == "__main__":
    main()
