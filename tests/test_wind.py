from fishon_engine.wind import angle_diff, compass, relative_to_coast


def test_compass():
    assert compass(0) == "N" and compass(359) == "N" and compass(315) == "NW" and compass(100) == "E"


def test_angle_diff_wraps():
    assert angle_diff(350, 10) == 20 and angle_diff(90, 270) == 180


def test_relative_east_facing_coast():
    # Moeraki-style coast facing E (90): E wind blows from the sea
    assert relative_to_coast(90, 90) == "onshore"
    assert relative_to_coast(270, 90) == "offshore"
    assert relative_to_coast(0, 90) == "cross-shore"
    assert relative_to_coast(300, 90) == "offshore"      # NW on an E coast
    assert relative_to_coast(45, 90) == "cross-onshore"
    assert relative_to_coast(225, 90) == "cross-offshore"


def test_relative_none():
    assert relative_to_coast(None, 90) is None and relative_to_coast(90, None) is None
