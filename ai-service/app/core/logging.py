"""Central logging configuration without secret-bearing values."""

import logging

request_logger = logging.getLogger("app.request")


def configure_logging(level: str) -> None:
    request_logger.setLevel(level.upper())
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
