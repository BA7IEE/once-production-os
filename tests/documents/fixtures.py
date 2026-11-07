"""Synthetic, non-personal documents for real parser integration tests."""
from pathlib import Path
import sys
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.lib.pdfencrypt import StandardEncryption

directory = Path(sys.argv[1])
photo = Image.new("RGB", (480, 320), "#dd4433")
ImageDraw.Draw(photo).rectangle((0, 160, 479, 319), fill="#2244cc")
photo.save(directory / "photo.png")
c = canvas.Canvas(str(directory / "portfolio.pdf"), pagesize=(600, 800), invariant=True)
c.drawString(50, 750, "Lin He - Director / Photographer")
c.drawString(50, 725, "Shanghai; film and commercial photography")
c.drawString(50, 700, "Contact: sample@example.invalid")
c.drawImage(ImageReader(photo), 50, 350, width=480, height=320)
c.drawString(50, 330, "Work A - director - 2024")
c.showPage()
c.setPageRotation(90)
c.drawString(50, 550, "Work B - photography - 2025")
c.drawImage(ImageReader(photo), 50, 200, width=300, height=200)
c.showPage()
c.save()

scan = Image.new("RGB", (600, 800), "white")
draw = ImageDraw.Draw(scan)
draw.text((30, 40), "Scanned resume: no native PDF text", fill="black")
draw.rectangle((30, 150, 300, 400), fill="#22aa55")
c = canvas.Canvas(str(directory / "scan.pdf"), pagesize=(600, 800), invariant=True)
c.drawImage(ImageReader(scan), 0, 0, width=600, height=800)
c.save()

c = canvas.Canvas(str(directory / "password.pdf"), encrypt=StandardEncryption("synthetic-password"), invariant=True)
c.drawString(50, 700, "Synthetic protected document")
c.save()
(directory / "broken.pdf").write_bytes(b"%PDF-1.7\nnot a valid document\n")

for name, count in [("long-portfolio.pdf", 10), ("over-limit.pdf", 101)]:
    c = canvas.Canvas(str(directory / name), pagesize=(600, 800), invariant=True)
    for number in range(1, count + 1):
        c.drawString(50, 750, f"Lin He - Portfolio page {number}")
        c.drawString(50, 725, f"Campaign {1 if number <= 6 else 2} - Director")
        c.drawImage(ImageReader(photo), 50, 350, width=480, height=320)
        c.showPage()
    c.save()
