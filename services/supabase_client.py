"""
Project: Crossbar Product Platform

Purpose:
    Create and return a Supabase client.
"""

import os
from dotenv import load_dotenv
from supabase import create_client


load_dotenv()


def get_supabase_client():
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not service_role_key:
        raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

    return create_client(supabase_url, service_role_key)