import requests
import os
import json

API_BASE = "https://tneb-policyai-production.up.railway.app/api/v1"

# Login
r = requests.post(f"{API_BASE}/auth/login", json={"username": "admin", "password": "admin@123"})
token = r.json()["token"]
headers = {"Authorization": f"Bearer {token}"}

# Upload each PDF from your local data/uploads folder
upload_dir = "./data/uploads"
meta_file = "./data/uploads/metadata.json"

with open(meta_file) as f:
    metadata = json.load(f)

# Get original filenames from metadata
for doc_id, info in metadata.items():
    original_name = info["original_name"]
    filename = info["filename"]
    filepath = os.path.join(upload_dir, filename)
    
    if not os.path.exists(filepath):
        print(f"Skipping {original_name} — file not found locally")
        continue
    
    print(f"Uploading {original_name}...")
    with open(filepath, "rb") as f:
        r = requests.post(
            f"{API_BASE}/documents/upload",
            headers=headers,
            files={"file": (original_name, f)},
            timeout=30,
        )
    if r.status_code == 202:
        print(f"  ✓ Done (job={r.json()['job_id']})")
    else:
        print(f"  ✗ Failed: {r.text}")

print("\nAll done! Processing happens in background on Railway.")