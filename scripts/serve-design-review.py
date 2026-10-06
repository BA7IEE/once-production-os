"""Loopback-only static preview with explicit read-only SPA routes, never an API."""
import argparse,functools,http.server,signal
from urllib.parse import urlsplit
parser=argparse.ArgumentParser();parser.add_argument('--root',required=True);parser.add_argument('--port',type=int,default=4319);args=parser.parse_args()
class Handler(http.server.SimpleHTTPRequestHandler):
 def do_GET(self):
  path=urlsplit(self.path).path
  if path.startswith('/api/'):
   self.send_error(503,'Static preview has no backend');return
  if path.startswith('/workspace/') or path.startswith('/talents'):
   self.path='/design-review/index.html'
  super().do_GET()
 def do_POST(self):self.send_error(503,'Static preview does not perform writes')
 def end_headers(self):
  self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'")
  self.send_header('Cache-Control','no-store');super().end_headers()
 def log_message(self,*_):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',args.port),functools.partial(Handler,directory=args.root))
def stop(*_):raise KeyboardInterrupt
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:server.server_close()
