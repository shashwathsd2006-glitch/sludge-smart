"""Launch the SLUDGE SMART API and frontend in separate windows.

Usage:  python start.py
Then open http://localhost:5300
"""

import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FLAGS = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)

processes = [
    subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(BACKEND),
        creationflags=FLAGS,
    ),
    subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(ROOT),
        shell=True,
        creationflags=FLAGS,
    ),
]

print("SLUDGE SMART starting…")
print("Frontend: http://localhost:5300")
print("API docs: http://localhost:8000/docs")
print("Close the two console windows to stop the application.")

time.sleep(3)
webbrowser.open("http://localhost:5300")

try:
    for process in processes:
        process.wait()
except KeyboardInterrupt:
    for process in processes:
        process.terminate()
