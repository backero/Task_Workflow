"""Page-rendering views for the Meesho Seller Command Center.

These routes render HTML shells only; all data is fetched client-side
from /api/* endpoints, so pages work even when the database is empty.
"""
from flask import Blueprint, render_template

views = Blueprint("views", __name__)


@views.get("/")
def dashboard():
    return render_template("dashboard.html", page="overview")


@views.get("/listings")
def listings():
    return render_template("listings.html", page="listings")


@views.get("/listing/<int:lid>")
def listing(lid):
    return render_template("listing.html", page="listings", listing_id=lid)


@views.get("/recommendations")
def recommendations():
    return render_template("recommendations.html", page="recommendations")


@views.get("/alerts")
def alerts():
    return render_template("alerts.html", page="alerts")


@views.get("/sources")
def sources():
    return render_template("sources.html", page="sources")


@views.get("/robot")
def robot_page():
    return render_template("robot.html", page="robot")


@views.get("/settings")
def settings():
    return render_template("settings.html", page="settings")
