import os
from pymongo import MongoClient

MONGO_URL = os.getenv("MONGO_URL")

if not MONGO_URL:
    print("⚠️ MONGO_URL not found")
    client = None
else:
    try:
        client = MongoClient(MONGO_URL)
        print("✅ MongoDB Connected")
    except Exception as e:
        print("❌ MongoDB Connection Failed:", e)
        client = None