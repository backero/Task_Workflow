"""SERP card parsing: prices must come from the visible ₹ text, and a repeated product counts once."""
from fkpulse.harvester import RankHarvester


class FakeCard:
    def __init__(self, fsn, amounts, title="A product"):
        self._fsn, self._amounts, self._title = fsn, amounts, title

    def get_attribute(self, name):
        return self._fsn if name == "data-id" else None

    def query_selector(self, sel):
        if sel == "a[title]":
            title = self._title

            class El:
                def get_attribute(self, n):
                    return title if n == "title" else None

                def inner_text(self):
                    return title
            return El()
        return None

    def evaluate(self, js):
        return self._amounts


class FakePage:
    def __init__(self, cards):
        self._cards = cards

    def query_selector_all(self, sel):
        return self._cards


def test_price_is_the_first_rupee_amount_and_mrp_the_second():
    page = FakePage([FakeCard("HOL1", ["₹111", "₹499"])])
    (row,) = RankHarvester._parse_cards(page, 1, 0)
    assert row["price"] == 111.0 and row["mrp"] == 499.0


def test_a_card_with_no_price_text_yields_none_not_a_crash():
    page = FakePage([FakeCard("HOL1", [])])
    (row,) = RankHarvester._parse_cards(page, 1, 0)
    assert row["price"] is None and row["mrp"] is None


def test_a_product_listed_twice_counts_once_so_ranks_do_not_drift():
    # real result: the same FSN appeared at positions 1 and 4
    page = FakePage([FakeCard("A", ["₹1", "₹2"]), FakeCard("B", ["₹3", "₹4"]), FakeCard("C", ["₹5", "₹6"]), FakeCard("A", ["₹1", "₹2"]), FakeCard("D", ["₹7", "₹8"])])
    rows = RankHarvester._parse_cards(page, 1, 0)
    assert [r["fsn"] for r in rows] == ["A", "B", "C", "D"]
    assert [r["position"] for r in rows] == [1, 2, 3, 4]


def test_a_product_seen_on_an_earlier_page_is_not_counted_again():
    seen = {"A"}
    page = FakePage([FakeCard("A", ["₹1"]), FakeCard("E", ["₹5"])])
    rows = RankHarvester._parse_cards(page, 2, 40, seen)
    assert [(r["fsn"], r["position"]) for r in rows] == [("E", 41)]
