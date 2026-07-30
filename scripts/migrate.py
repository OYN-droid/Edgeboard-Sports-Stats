from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.config import ProviderConfig
from server.database import Database


def main() -> None:
    config = ProviderConfig.from_env()
    database = Database(config.database_url)
    try:
        version = database.migrate()
        print(f"EdgeBoard database schema is at version {version}.")
    finally:
        database.close()


if __name__ == "__main__":
    main()
