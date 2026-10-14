import hmac
import os
import threading
from datetime import timezone

from dotenv import load_dotenv
import psycopg
from flask import Flask, jsonify, render_template, request
from psycopg.rows import dict_row

load_dotenv()

app = Flask(__name__)
_database_initialized = False
_database_init_lock = threading.Lock()

SEED_PRODUCTS = [
    {
        "id": "headphones",
        "name": "Studio Wireless Headphones",
        "category": "Electronics",
        "description": "Immersive sound, comfortable fit, and all-day battery life.",
        "price_cents": 7999,
        "rating": 4.8,
        "image": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85",
        "badge": "Bestseller",
    },
    {
        "id": "coffee-maker",
        "name": "Pour-Over Coffee Maker",
        "category": "Home",
        "description": "A simple glass brewer for a better morning cup.",
        "price_cents": 3499,
        "rating": 4.6,
        "image": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=85",
        "badge": "Great value",
    },
    {
        "id": "backpack",
        "name": "Everyday Explorer Backpack",
        "category": "Accessories",
        "description": "A durable, thoughtfully organized bag for daily adventures.",
        "price_cents": 5899,
        "rating": 4.7,
        "image": "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85",
        "badge": "",
    },
    {
        "id": "desk-lamp",
        "name": "Modern LED Desk Lamp",
        "category": "Home",
        "description": "Warm, adjustable light for focused work and reading.",
        "price_cents": 4299,
        "rating": 4.5,
        "image": "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85",
        "badge": "Popular",
    },
    {
        "id": "camera",
        "name": "Instant Snapshot Camera",
        "category": "Electronics",
        "description": "Capture everyday moments and print them in an instant.",
        "price_cents": 9999,
        "rating": 4.9,
        "image": "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=85",
        "badge": "Top rated",
    },
    {
        "id": "bottle",
        "name": "Insulated Travel Bottle",
        "category": "Accessories",
        "description": "A leakproof stainless-steel bottle for hot or cold drinks.",
        "price_cents": 2499,
        "rating": 4.7,
        "image": "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85",
        "badge": "",
    },
    {
        "id": "speaker",
        "name": "Portable Bluetooth Speaker",
        "category": "Electronics",
        "description": "Room-filling sound in a compact, travel-ready design.",
        "price_cents": 6499,
        "rating": 4.6,
        "image": "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=85",
        "badge": "Staff pick",
    },
    {
        "id": "plant",
        "name": "Ceramic Planter Set",
        "category": "Home",
        "description": "Minimal ceramic pots to bring a little green indoors.",
        "price_cents": 3199,
        "rating": 4.4,
        "image": "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=900&q=85",
        "badge": "",
    },
]

ALLOWED_STATUSES = {"Pending", "Processing", "Shipped", "Cancelled"}


def get_connection():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise psycopg.OperationalError(
            "DATABASE_URL is not set. Add your Railway PostgreSQL connection URL."
        )
    return psycopg.connect(database_url, connect_timeout=10, row_factory=dict_row)


def initialize_database():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT NOT NULL,
                price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
                rating NUMERIC(2, 1) NOT NULL,
                image TEXT NOT NULL,
                badge TEXT NOT NULL DEFAULT ''
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id BIGSERIAL PRIMARY KEY,
                customer_name TEXT NOT NULL,
                email TEXT NOT NULL,
                address TEXT NOT NULL,
                total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
                status TEXT NOT NULL DEFAULT 'Pending',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS order_items (
                id BIGSERIAL PRIMARY KEY,
                order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0)
            )
            """
        )
        count = connection.execute("SELECT COUNT(*) AS count FROM products").fetchone()["count"]
        if count == 0:
            connection.executemany(
                """
                INSERT INTO products
                    (id, name, category, description, price_cents, rating, image, badge)
                VALUES
                    (%(id)s, %(name)s, %(category)s, %(description)s, %(price_cents)s,
                     %(rating)s, %(image)s, %(badge)s)
                ON CONFLICT (id) DO NOTHING
                """,
                SEED_PRODUCTS,
            )


@app.errorhandler(psycopg.Error)
def handle_database_error(error):
    app.logger.exception("A database operation failed", exc_info=error)
    return jsonify(error="The store database is temporarily unavailable. Please try again."), 503


@app.before_request
def ensure_database_initialized():
    global _database_initialized
    if not request.path.startswith("/api/") or _database_initialized:
        return
    if request.path.startswith("/api/admin/") and not admin_authorized():
        return jsonify(error="A valid admin token is required."), 401
    with _database_init_lock:
        if not _database_initialized:
            initialize_database()
            _database_initialized = True


def admin_authorized():
    expected_token = os.environ.get("ADMIN_TOKEN")
    supplied_token = request.headers.get("X-Admin-Token", "")
    return bool(expected_token) and hmac.compare_digest(supplied_token, expected_token)


def as_json_order(order, items):
    created_at = order["created_at"]
    return {
        "id": order["id"],
        "customer_name": order["customer_name"],
        "email": order["email"],
        "address": order["address"],
        "total_cents": order["total_cents"],
        "status": order["status"],
        "created_at": created_at.astimezone(timezone.utc).isoformat(),
        "items": [
            {
                "product_name": item["product_name"],
                "quantity": item["quantity"],
                "unit_price_cents": item["unit_price_cents"],
            }
            for item in items
        ],
    }


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/products")
def list_products():
    with get_connection() as connection:
        products = connection.execute(
            """
            SELECT id, name, category, description, price_cents, rating, image, badge
            FROM products ORDER BY id
            """
        ).fetchall()
    return jsonify(products)


@app.post("/api/orders")
def create_order():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify(error="Please submit a valid order."), 400

    name = payload.get("customer_name", "").strip() if isinstance(payload.get("customer_name"), str) else ""
    email = payload.get("email", "").strip() if isinstance(payload.get("email"), str) else ""
    address = payload.get("address", "").strip() if isinstance(payload.get("address"), str) else ""
    items = payload.get("items")
    local_part, separator, domain = email.partition("@")
    if (
        not name
        or len(name) > 120
        or not separator
        or not local_part
        or "." not in domain
        or domain.startswith(".")
        or domain.endswith(".")
        or "@" in domain
        or len(email) > 254
    ):
        return jsonify(error="Enter a valid name and email address."), 400
    if not address or len(address) > 500:
        return jsonify(error="Enter a valid delivery address."), 400
    if not isinstance(items, list) or not 1 <= len(items) <= 30:
        return jsonify(error="Your cart must contain between 1 and 30 products."), 400

    quantities = {}
    for item in items:
        if not isinstance(item, dict):
            return jsonify(error="The cart contains an invalid product."), 400
        product_id, quantity = item.get("product_id"), item.get("quantity")
        if (
            not isinstance(product_id, str)
            or not isinstance(quantity, int)
            or isinstance(quantity, bool)
            or not 1 <= quantity <= 20
        ):
            return jsonify(error="The cart contains an invalid product quantity."), 400
        quantities[product_id] = quantities.get(product_id, 0) + quantity
        if quantities[product_id] > 20:
            return jsonify(error="You can order up to 20 of each product."), 400

    with get_connection() as connection:
        products = connection.execute(
            """
            SELECT id, name, price_cents FROM products
            WHERE id = ANY(%s)
            FOR SHARE
            """,
            (list(quantities),),
        ).fetchall()
        if len(products) != len(quantities):
            return jsonify(error="One or more products are no longer available."), 400
        product_by_id = {product["id"]: product for product in products}
        total_cents = sum(
            product_by_id[product_id]["price_cents"] * quantity
            for product_id, quantity in quantities.items()
        )
        order = connection.execute(
            """
            INSERT INTO orders (customer_name, email, address, total_cents)
            VALUES (%s, %s, %s, %s)
            RETURNING id, customer_name, email, address, total_cents, status, created_at
            """,
            (name, email, address, total_cents),
        ).fetchone()
        order_items = []
        for product_id, quantity in quantities.items():
            product = product_by_id[product_id]
            order_items.append(
                {
                    "product_name": product["name"],
                    "quantity": quantity,
                    "unit_price_cents": product["price_cents"],
                }
            )
            connection.execute(
                """
                INSERT INTO order_items
                    (order_id, product_id, product_name, quantity, unit_price_cents)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (order["id"], product_id, product["name"], quantity, product["price_cents"]),
            )
    return jsonify(as_json_order(order, order_items)), 201


@app.get("/api/admin/orders")
def list_orders():
    if not admin_authorized():
        return jsonify(error="A valid admin token is required."), 401
    with get_connection() as connection:
        orders = connection.execute(
            """
            SELECT id, customer_name, email, address, total_cents, status, created_at
            FROM orders ORDER BY created_at DESC LIMIT 200
            """
        ).fetchall()
        order_ids = [order["id"] for order in orders]
        items_by_order = {order_id: [] for order_id in order_ids}
        if order_ids:
            items = connection.execute(
                """
                SELECT order_id, product_name, quantity, unit_price_cents
                FROM order_items WHERE order_id = ANY(%s) ORDER BY id
                """,
                (order_ids,),
            ).fetchall()
            for item in items:
                items_by_order[item["order_id"]].append(item)
    return jsonify([as_json_order(order, items_by_order[order["id"]]) for order in orders])


@app.patch("/api/admin/orders/<int:order_id>")
def update_order(order_id):
    if not admin_authorized():
        return jsonify(error="A valid admin token is required."), 401
    payload = request.get_json(silent=True)
    status = payload.get("status") if isinstance(payload, dict) else None
    if status not in ALLOWED_STATUSES:
        return jsonify(error="Choose a valid order status."), 400
    with get_connection() as connection:
        order = connection.execute(
            """
            UPDATE orders SET status = %s WHERE id = %s
            RETURNING id, customer_name, email, address, total_cents, status, created_at
            """,
            (status, order_id),
        ).fetchone()
        if order is None:
            return jsonify(error="Order not found."), 404
        items = connection.execute(
            """
            SELECT product_name, quantity, unit_price_cents
            FROM order_items WHERE order_id = %s ORDER BY id
            """,
            (order_id,),
        ).fetchall()
    return jsonify(as_json_order(order, items))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=False)
