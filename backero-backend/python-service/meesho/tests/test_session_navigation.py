from types import SimpleNamespace

from app.connector.meesho_keeper import MeeshoKeeper
from app.connectors import panel_reader


class Page:
    def __init__(self, url, body):
        self.url = url
        self.body = body
        self.reloads = 0
        self.navigations = []

    def is_closed(self):
        return False

    def inner_text(self, selector):
        return self.body

    def reload(self, **kwargs):
        self.reloads += 1

    def goto(self, *args, **kwargs):
        assert '/login' not in args[0], 'An authenticated session must not navigate to login'
        self.navigations.append(args[0])
        self.url = args[0]

    def wait_for_timeout(self, duration):
        pass


def test_authenticated_tab_is_selected_over_the_stale_login_tab():
    login = Page('https://supplier.meesho.com/panel/v3/new/root/login', 'Login')
    dashboard = Page('https://supplier.meesho.com/panel/v3/new/root/home', 'Orders Payments ' * 30)
    ctx = SimpleNamespace(pages=[login, dashboard])
    assert panel_reader.signed_in_page(ctx, login) is dashboard


def test_keepalive_refreshes_the_authenticated_page_without_visiting_login():
    dashboard = Page('https://supplier.meesho.com/panel/v3/new/root/home', 'Orders Payments ' * 30)
    keeper = MeeshoKeeper.__new__(MeeshoKeeper)
    assert keeper._alive(dashboard, reload=True)
    assert dashboard.navigations == [dashboard.url]


def test_login_in_progress_is_left_untouched():
    login = Page('https://supplier.meesho.com/panel/v3/new/root/login', 'Enter OTP')
    keeper = MeeshoKeeper.__new__(MeeshoKeeper)
    assert not keeper._alive(login, reload=True)
    assert login.reloads == 0
    assert login.navigations == []


def test_keepalive_returns_to_verified_home_after_a_deep_catalog_read():
    home = 'https://supplier.meesho.com/panel/v3/new/growth/example/home'
    page = Page(home, 'Orders Payments ' * 30)
    keeper = MeeshoKeeper.__new__(MeeshoKeeper)
    assert keeper._alive(page, reload=False)
    page.url = 'https://supplier.meesho.com/panel/v3/new/cataloging/example/catalogs/bulk'
    assert keeper._alive(page, reload=True)
    assert page.navigations == [home]


def test_loading_panel_is_not_reported_as_an_expired_login():
    page = Page('https://supplier.meesho.com/panel/v3/new/cataloging/example/catalogs/bulk', 'Loading...')
    keeper = MeeshoKeeper.__new__(MeeshoKeeper)
    assert keeper._alive(page, reload=True) is None
    assert page.navigations == []


def test_real_redirect_to_login_still_reports_expired_session():
    class ExpiredPage(Page):
        def goto(self, *args, **kwargs):
            self.url = 'https://supplier.meesho.com/panel/v3/new/root/login'

    page = ExpiredPage('https://supplier.meesho.com/panel/v3/new/growth/example/home', 'Loading...')
    keeper = MeeshoKeeper.__new__(MeeshoKeeper)
    keeper._authenticated_home = page.url
    assert keeper._alive(page, reload=True) is False


def test_section_navigation_never_reenters_the_login_route():
    home = 'https://supplier.meesho.com/panel/v3/new/growth/example/home'
    page = Page(home, 'Orders Payments ' * 30)
    page.get_by_text = lambda *args, **kwargs: SimpleNamespace(first=SimpleNamespace(click=lambda **kw: None))
    panel_reader._open_nav(page, 'Payments')
    page.url = 'https://supplier.meesho.com/panel/v3/new/cataloging/example/catalogs/bulk'
    panel_reader._open_nav(page, 'Pricing')
    assert page.navigations == [home, home]
