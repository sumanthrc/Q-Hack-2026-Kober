"""
run.py

CLI entry point for the Kober recommendation engine.

Usage:
    python run.py generate <customer_id> [--no-llm] [--valid-hours N] [--fc-id FC_ID]
    python run.py get      <customer_id>
    python run.py accept   <basket_id>
    python run.py reject   <basket_id>
    python run.py modify   <basket_id> <SKU1> [SKU2 ...]

Output (generate / get):
    Writes output/<customer_id>.json with the full basket and LLM reasoning.
"""

import argparse
import json
import pathlib
import sys
from decimal import Decimal

from dotenv import load_dotenv

from db.connection import init_pool
from engine.analytics import refresh_all, refresh_all_customers
from engine.orchestrator import (
    accept_basket,
    get_latest_basket,
    modify_basket,
    reject_basket,
    run_pipeline,
)

OUTPUT_DIR = pathlib.Path(__file__).parent / "output"


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

def bootstrap():
    load_dotenv()
    init_pool()


# ---------------------------------------------------------------------------
# Shared helper
# ---------------------------------------------------------------------------

class _JsonEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def _write_basket(customer_id: str, basket: dict) -> pathlib.Path:
    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / f"{customer_id}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(basket, f, indent=2, cls=_JsonEncoder)
    return out_path


# ---------------------------------------------------------------------------
# Subcommand handlers
# ---------------------------------------------------------------------------

def cmd_train(args):
    if args.customer_id:
        print(f"[train] Refreshing analytics for customer {args.customer_id}...")
        refresh_all(args.customer_id)
        print(f"[train] Done.")
    else:
        print("[train] Refreshing analytics for ALL customers...")
        refresh_all_customers()
        print("[train] Done.")


def cmd_generate(args):
    basket_id = run_pipeline(
        customer_id=args.customer_id,
        use_llm=not args.no_llm,
        valid_hours=args.valid_hours,
        fc_id=args.fc_id,
        skip_refresh=not args.refresh,
    )
    if basket_id is None:
        print(f"[generate] No recommendations could be generated for customer {args.customer_id}.")
        sys.exit(1)

    basket = get_latest_basket(args.customer_id)
    if basket is None:
        print(f"[generate] Pipeline returned basket {basket_id} but it could not be fetched.")
        sys.exit(1)

    out_path = _write_basket(args.customer_id, basket)
    print(f"[generate] Basket {basket_id} written to {out_path}")


def cmd_get(args):
    basket = get_latest_basket(args.customer_id)
    if basket is None:
        print(f"[get] No pending basket found for customer {args.customer_id}.")
        sys.exit(1)

    out_path = _write_basket(args.customer_id, basket)
    print(f"[get] Basket {basket['basket_id']} written to {out_path}")


def cmd_accept(args):
    accept_basket(args.basket_id)
    print(f"[accept] Basket {args.basket_id} accepted.")


def cmd_reject(args):
    reject_basket(args.basket_id)
    print(f"[reject] Basket {args.basket_id} rejected.")


def cmd_modify(args):
    modify_basket(args.basket_id, args.kept_skus)
    print(f"[modify] Basket {args.basket_id} modified. Kept SKUs: {args.kept_skus}")


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def build_parser():
    parser = argparse.ArgumentParser(
        prog="run.py",
        description="CLI for the Kober recommendation engine",
    )
    sub = parser.add_subparsers(dest="command", metavar="COMMAND")
    sub.required = True

    # train
    p_train = sub.add_parser(
        "train",
        help="Pre-compute analytics tables (frequency, cycle, drift) for fast generation",
    )
    p_train.add_argument(
        "customer_id", nargs="?", default=None,
        help="Customer to train (omit to train ALL customers)",
    )
    p_train.set_defaults(func=cmd_train)

    # generate
    p_gen = sub.add_parser("generate", help="Run pipeline and save basket to output/")
    p_gen.add_argument("customer_id")
    p_gen.add_argument(
        "--no-llm", action="store_true", default=False,
        help="Skip LLM enrichment (faster, no Gemini API call)",
    )
    p_gen.add_argument(
        "--refresh", action="store_true", default=False,
        help="Re-run analytics refresh before generating (default: use pre-trained tables)",
    )
    p_gen.add_argument(
        "--valid-hours", type=int, default=24, metavar="N",
        help="Hours the basket remains valid (default: 24)",
    )
    p_gen.add_argument(
        "--fc-id", default="FC1", metavar="FC_ID",
        help="Fulfilment centre ID (default: FC1)",
    )
    p_gen.set_defaults(func=cmd_generate)

    # get
    p_get = sub.add_parser("get", help="Fetch latest pending basket and save to output/")
    p_get.add_argument("customer_id")
    p_get.set_defaults(func=cmd_get)

    # accept
    p_acc = sub.add_parser("accept", help="Accept a basket")
    p_acc.add_argument("basket_id")
    p_acc.set_defaults(func=cmd_accept)

    # reject
    p_rej = sub.add_parser("reject", help="Reject a basket")
    p_rej.add_argument("basket_id")
    p_rej.set_defaults(func=cmd_reject)

    # modify
    p_mod = sub.add_parser("modify", help="Modify basket — keep only the listed SKUs")
    p_mod.add_argument("basket_id")
    p_mod.add_argument(
        "kept_skus", nargs="+", metavar="SKU",
        help="One or more SKUs to keep (space-separated)",
    )
    p_mod.set_defaults(func=cmd_modify)

    return parser


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = build_parser()
    args = parser.parse_args()
    bootstrap()
    args.func(args)


if __name__ == "__main__":
    main()
