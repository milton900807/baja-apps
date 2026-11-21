"""The `bajasplicemm` command: the bajasplice CLI, as mouse."""
from bajasplice.config import set_species


def main(argv=None):
    set_species("mouse")
    from bajasplice.cli import main as _main
    return _main(argv)


if __name__ == "__main__":
    raise SystemExit(main())
