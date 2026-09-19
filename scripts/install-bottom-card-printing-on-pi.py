#!/usr/bin/env python3
"""Install PLA Forge Bottom Card printing on the Raspberry Pi Print Bridge.

Run this as the `plapals` user on plapals-printbridge-4. It downloads the
three approved PDFs from the shared Google Drive folder, installs the CUPS
print helper, adds the authenticated API endpoint, and restarts the bridge.
"""

from pathlib import Path
import shutil
import subprocess
import textwrap


BRIDGE = Path("/home/plapals/forge-bridge")
API = BRIDGE / "api.py"
CARDS = BRIDGE / "bottom-cards"
DRIVE_FOLDER_ID = "1BzH_lNbdqa-A5DXXR7DkHMr8sMWBcYHc"
FILES = {
    "blue": "Bottom Card Blue.pdf",
    "white": "Bottom Card White.pdf",
    "purple": "Bottom Card Purple.pdf",
}

PRINT_HELPER = '''#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

CARDS = Path("/home/plapals/forge-bridge/bottom-cards")
PRINTER = "PLA_PALS_INSERTS"
FILES = {
    "blue": "Bottom Card Blue.pdf",
    "white": "Bottom Card White.pdf",
    "purple": "Bottom Card Purple.pdf",
}

def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)

if len(sys.argv) != 3:
    fail("Usage: print-bottom-cards blue|white|purple quantity")

colour = sys.argv[1].strip().lower()
try:
    quantity = int(sys.argv[2])
except ValueError:
    fail("Quantity must be a whole number.")

if colour not in FILES:
    fail("Colour must be blue, white, or purple.")
if quantity < 1 or quantity > 100:
    fail("Quantity must be between 1 and 100 sheets.")

pdf = CARDS / FILES[colour]
if not pdf.is_file() or pdf.stat().st_size == 0:
    fail(f"Bottom-card PDF is missing: {pdf}")

result = subprocess.run([
    "lp", "-d", PRINTER, "-n", str(quantity),
    "-o", "PageSize=A4", "-o", "MediaType=PMMATT_HIGH",
    "-o", "Ink=COLOR", "-o", "fit-to-page=false", str(pdf)
], capture_output=True, text=True)

if result.returncode != 0:
    fail(result.stderr.strip() or result.stdout.strip() or "CUPS rejected the print job.")

print(result.stdout.strip())
'''

API_BLOCK = '''

# Bottom card printing -------------------------------------------------------
BOTTOM_CARDS_DIR = Path("/home/plapals/forge-bridge/bottom-cards")
BOTTOM_CARD_FILES = {
    "blue": "Bottom Card Blue.pdf",
    "white": "Bottom Card White.pdf",
    "purple": "Bottom Card Purple.pdf",
}

def run_bottom_card_print(colour, quantity):
    result = subprocess.run(
        ["print-bottom-cards", colour, str(quantity)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    output = result.stdout.strip()
    error = result.stderr.strip()
    if result.returncode != 0:
        app.logger.error("Bottom-card print failed for %s qty %s: %s", colour, quantity, error or output or "Unknown error")
        return
    app.logger.info("Bottom-card print submitted for %s qty %s: %s", colour, quantity, output)

@app.post("/print-bottom-cards")
def print_bottom_cards():
    auth_error = require_api_key()
    if auth_error:
        return auth_error
    data = request.get_json(silent=True) or {}
    colour = str(data.get("color", "")).strip().lower()
    try:
        quantity = int(data.get("quantity"))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Quantity must be a whole number."}), 400
    if colour not in BOTTOM_CARD_FILES:
        return jsonify({"success": False, "error": "Colour must be blue, white, or purple."}), 400
    if quantity < 1 or quantity > 100:
        return jsonify({"success": False, "error": "Quantity must be between 1 and 100 sheets."}), 400
    pdf = BOTTOM_CARDS_DIR / BOTTOM_CARD_FILES[colour]
    if not pdf.is_file() or pdf.stat().st_size == 0:
        return jsonify({"success": False, "error": f"Bottom-card PDF is missing: {pdf.name}"}), 409
    worker = threading.Thread(target=run_bottom_card_print, args=(colour, quantity), daemon=True)
    worker.start()
    return jsonify({
        "success": True,
        "accepted": True,
        "color": colour,
        "quantity": quantity,
        "cards_per_sheet": 6,
        "message": "Bottom-card print accepted and is being prepared.",
    }), 202
'''


def run(command):
    print("+", " ".join(command))
    subprocess.run(command, check=True)


def main():
    if not API.is_file():
        raise SystemExit(f"Could not find {API}")
    if not shutil.which("rclone"):
        raise SystemExit("rclone is not installed on this Pi.")
    if not shutil.which("sudo"):
        raise SystemExit("sudo is required to install the print helper and restart the bridge.")

    CARDS.mkdir(parents=True, exist_ok=True)
    file_list = CARDS / ".drive-files.txt"
    file_list.write_text("\n".join(FILES.values()) + "\n")
    run([
        "rclone", "copy", "forge-drive:", str(CARDS),
        "--drive-root-folder-id", DRIVE_FOLDER_ID,
        "--files-from", str(file_list), "--transfers", "3", "--checkers", "4",
    ])
    file_list.unlink(missing_ok=True)
    missing = [name for name in FILES.values() if not (CARDS / name).is_file() or (CARDS / name).stat().st_size == 0]
    if missing:
        raise SystemExit("Google Drive sync did not provide: " + ", ".join(missing))

    helper = BRIDGE / ".print-bottom-cards.new"
    helper.write_text(PRINT_HELPER)
    run(["sudo", "install", "-m", "755", str(helper), "/usr/local/bin/print-bottom-cards"])
    helper.unlink(missing_ok=True)

    api_text = API.read_text()
    if 'def print_bottom_cards():' not in api_text:
        marker = '\nif __name__ == "__main__":'
        if marker not in api_text:
            raise SystemExit("Could not find the end of api.py; no API changes were made.")
        backup = API.with_name("api.py.before-bottom-card-printing")
        backup.write_text(api_text)
        API.write_text(api_text.replace(marker, textwrap.dedent(API_BLOCK) + marker, 1))
        print("Updated", API)
        print("Backup saved as", backup)
    else:
        print("Bottom-card API route is already installed.")

    run(["python3", "-m", "py_compile", str(API)])
    run(["sudo", "systemctl", "restart", "forge-bridge"])
    run(["curl", "-fsS", "http://localhost:8765/health"])
    print("Bottom-card printing is ready. Blue = Main, White = Christmas, Purple = Halloween.")


if __name__ == "__main__":
    main()
