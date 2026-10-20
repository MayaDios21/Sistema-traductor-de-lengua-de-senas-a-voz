"""Servidor local del Traductor LSM.

Sirve los archivos estáticos (la cámara solo funciona en localhost) y acepta
POST /guardar?ruta=<datos/... | modelo/...> para que entrenar.html pueda
guardar los landmarks extraídos y el modelo entrenado dentro del proyecto.

Uso:  python servidor.py   →   http://localhost:8000
"""
import http.server
import json
import os
import socketserver
import urllib.parse

PUERTO = 8000
RAIZ = os.path.dirname(os.path.abspath(__file__))
CARPETAS_ESCRIBIBLES = ("datos", "modelo")
EXT_IMAGEN = (".jpg", ".jpeg", ".png")


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        # Índice del dataset generado al vuelo: { "A": ["dataset/A/x.jpg", ...], ... }
        if self.path.split("?")[0] == "/dataset/indice.json":
            carpeta = os.path.join(RAIZ, "dataset")
            indice = {}
            if os.path.isdir(carpeta):
                for letra in sorted(os.listdir(carpeta)):
                    ruta = os.path.join(carpeta, letra)
                    if os.path.isdir(ruta):
                        indice[letra] = [
                            f"dataset/{letra}/{n}"
                            for n in sorted(os.listdir(ruta))
                            if n.lower().endswith(EXT_IMAGEN)
                        ]
            return self._json(200, indice)
        return super().do_GET()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != "/guardar":
            return self._json(404, {"error": "ruta no encontrada"})
        ruta = urllib.parse.parse_qs(url.query).get("ruta", [""])[0]
        destino = os.path.normpath(os.path.join(RAIZ, ruta))
        relativa = os.path.relpath(destino, RAIZ).replace("\\", "/")
        if relativa.split("/")[0] not in CARPETAS_ESCRIBIBLES or ".." in relativa:
            return self._json(403, {"error": "solo se puede escribir en datos/ o modelo/"})
        largo = int(self.headers.get("Content-Length", 0))
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        with open(destino, "wb") as f:
            f.write(self.rfile.read(largo))
        return self._json(200, {"ok": True, "ruta": relativa})

    def _json(self, codigo, obj):
        cuerpo = json.dumps(obj).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)


class Servidor(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    with Servidor(("127.0.0.1", PUERTO), Manejador) as s:
        print(f"Traductor LSM en http://localhost:{PUERTO}  (Ctrl+C para detener)")
        s.serve_forever()
