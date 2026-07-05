"""HardwareSensorSource — Stage 2 interface stub (CLAUDE.md §2 / §9).

Round 1 implements **nothing** here. This class exists only to prove the swap principle:
in Stage 2, ``DatasetReplaySource`` is replaced by ``HardwareSensorSource`` and nothing
above the ``SensorSource`` seam changes. No GPIO / I²C / driver code in Round 1.
"""

from __future__ import annotations

from .base import SensorSource, SignalWindow

_STAGE2 = "Stage 2: HardwareSensorSource is not implemented in Round 1"


class HardwareSensorSource(SensorSource):
    """Stage-2 source for the scaled spindle analog rig (interface only).

    Planned channel mapping (Stage 2):
        MPU6050  -> ``"vibration"``
        INA219   -> ``"current"``
        DS18B20  -> ``"temp"``

    Every method raises :class:`NotImplementedError` in Round 1.
    """

    def __init__(self, *args: object, **kwargs: object) -> None:
        raise NotImplementedError(_STAGE2)

    def next_window(self) -> SignalWindow:
        raise NotImplementedError(_STAGE2)
