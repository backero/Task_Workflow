from types import SimpleNamespace

from app.connector.meesho_keeper import MeeshoKeeper
from app.connectors import panel_reader


class Page:
    def __init__(self, url, body):
        self.url = url
        self.body = body
        self.reloads = 0

    def is_closed(self):
        return False

    def inner_text(self, selector):
        return self.body

    def reload(self, **kwargs):
        self.reloads += 1

    def goto(self, *args, **kwargs):
        raise AssertionError('An authenticated session must not navigate to login')

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
    assert dashboard.reloads == 1


def test_login_in_progress_is_left_untouched():
    login = Page('https://supplier.meesho.com/panel/v3/new/root/login', 'Enter OTP')
    keeper = MeeshoKeeper.__new__(MeeshoKeeper)
    assert not keeper._alive(login, reload=True)
    assert login.reloads == 0
