"""The `bajasplicedm` command: the bajasplice CLI, as fly."""
from bajasplice.config import set_species


def main(argv=None):
    set_species("fly")
    from bajasplice.cli import main as _main
    return _main(argv)


if __name__ == "__main__":
    raise SystemExit(main())
