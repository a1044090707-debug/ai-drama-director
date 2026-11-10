"""Run the static website from this directory with Python 3.9+."""
import argparse
import errno
import functools
import http.server
import socket
from pathlib import Path
import threading
import webbrowser
from movie_server import MovieHandler, MovieManager


class LocalServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    parser = argparse.ArgumentParser(description="Start the AI Director website")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    manager = MovieManager(root)
    MovieHandler.manager = manager
    handler = functools.partial(MovieHandler, directory=str(root))
    http.server.SimpleHTTPRequestHandler.extensions_map.update({".mjs": "text/javascript", ".glb": "model/gltf-binary"})
    for port in range(args.port, min(args.port + 20, 65536)):
        try:
            server = LocalServer(("127.0.0.1", port), handler)
            break
        except OSError as error:
            if error.errno not in (errno.EADDRINUSE, 10048):
                raise
    else:
        raise SystemExit("No free local port; use --port to choose another port.")
    url = f"http://127.0.0.1:{port}/"
    threading.Thread(target=manager.prepare_tool, daemon=True).start()
    print(f"Website: {url}\nFolder: {root}\nPress Ctrl+C to stop.", flush=True)
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        for job_id in list(manager.jobs):
            manager.cancel(job_id)
        manager.pool.shutdown(wait=False)


if __name__ == "__main__":
    main()
