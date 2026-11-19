# Runs a baja py module with a stubbed `ion.works`, so the real script is exercised.
import sys, json, types, io, contextlib

def run(path, params):
    captured = {}
    works = types.SimpleNamespace(
        param=lambda i: params[i - 1] if i - 1 < len(params) else None,
        resolve=lambda d: captured.update(d or {}),
        progress=lambda *a, **k: None,
    )
    mod = types.ModuleType("ion"); mod.works = works
    sys.modules["ion"] = mod
    src = open(path).read()
    g = {"__name__": "__main__"}
    with contextlib.redirect_stdout(io.StringIO()):
        exec(compile(src, path, "exec"), g)
    return captured
