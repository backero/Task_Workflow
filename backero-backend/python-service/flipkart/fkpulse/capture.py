"""Opt-in, local read-only capture for diagnosing Seller Hub layout changes."""
import json
from urllib.parse import urlsplit


def capture_requested(ctx, request):
    jobs = json.loads(request.read_text(encoding="utf-8-sig"))
    request.unlink()
    page = ctx.new_page()
    network = []

    def observed(response):
        if response.request.resource_type not in ("fetch", "xhr"):
            return
        url = urlsplit(response.url)
        if not (url.netloc.endswith("flipkart.com") or url.netloc.endswith("flipkart.net")):
            return
        info = {"host": url.netloc, "path": url.path, "status": response.status}
        try:
            data = response.json()
            info["keys"] = list(data)[:40] if isinstance(data, dict) else "list"
            if url.path == '/orchestrator/graphql':
                def shape(value, depth=0):
                    if depth > 9:
                        return type(value).__name__
                    if isinstance(value, dict):
                        return {k: shape(v, depth+1) for k, v in value.items()}
                    if isinstance(value, list):
                        return {'length': len(value), 'item': shape(value[0], depth+1) if value else None}
                    return type(value).__name__
                info['schema'] = shape(data)
                branch = data.get('data', {}).get('filteredShipmentGroups')
                if branch is not None:
                    from fkpulse.history import normalize_shipments
                    info['orders'] = normalize_shipments(data, 'completed')
                    try:
                        body = response.request.post_data_json
                        info['request_schema'] = shape(body)
                    except Exception:
                        pass
        except Exception:
            pass
        network.append(info)

    page.on("response", observed)
    try:
        for job in jobs:
            if job.get('sync_history'):
                import importlib
                from fkpulse import history, sellerhub
                importlib.reload(sellerhub)
                importlib.reload(history)
                result = history.read_history(ctx, str(request.parent.parent / 'fk_pulse.db'))
                (request.parent / 'capture_history_status.json').write_text(json.dumps(result), encoding='utf-8')
                continue
            url = job["url"]
            if urlsplit(url).scheme != "https" or urlsplit(url).netloc != "seller.flipkart.com":
                continue
            name = job["name"]
            if not name.replace("_", "").isalnum():
                continue
            network.clear()
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(20000)
            for label in job.get('hovers', []):
                if label not in ('Orders', 'Reports'):
                    raise ValueError('Unsupported diagnostic menu')
                page.get_by_text(label, exact=True).first.hover(timeout=10000)
                page.wait_for_timeout(1500)
            for label in job.get("clicks", []):
                if label not in ("Completed Orders", "To Dispatch", "In Transit", "Orders", "Returns", "Completed", "In Progress"):
                    raise ValueError("Unsupported diagnostic navigation")
                page.get_by_text(label, exact=True).first.click(timeout=10000)
                page.wait_for_timeout(10000)
            data = {"url": page.url, "text": page.inner_text("body"), "tables": page.locator('table').evaluate_all(
                "els => els.map(t => ({headers:Array.from(t.querySelectorAll('th')).map(e=>e.innerText), rows:Array.from(t.querySelectorAll('tr')).map(r=>Array.from(r.querySelectorAll('td')).map(c=>c.innerText))}))"),
                "network": network,
                "links": page.locator('a[href]').evaluate_all("els => els.map(e=>({text:e.innerText,href:e.getAttribute('href')}))")}
            (request.parent / ("capture_" + name + ".json")).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    finally:
        page.close()
