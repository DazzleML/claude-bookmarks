"""A square 1024 px PNG icon for the bookmarks plugin: a dark rounded tile, a yellow
bookmark ribbon (the mark colour), a small white notch for the fold. Written with
Pillow; ASCII only. The directory takes the icon once, at the first submission."""
import sys
from PIL import Image, ImageDraw

out = sys.argv[1]
S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
# tile
d.rounded_rectangle((0, 0, S - 1, S - 1), radius=180, fill=(27, 55, 84, 255))  # #1B3754, the band's blue
# ribbon: a tall rectangle with a notch cut from the bottom
x0, x1 = 340, 684
top, bot = 160, 880
notch = 110
ribbon = [(x0, top), (x1, top), (x1, bot), ((x0 + x1) // 2, bot - notch), (x0, bot)]
d.polygon(ribbon, fill=(255, 214, 10, 255))  # the mark yellow
# fold line near the top of the ribbon
d.rectangle((x0, top + 150, x1, top + 170), fill=(27, 55, 84, 255))


def sparkle(cx, cy, r, color):
    """A four-point star: two slim diamonds crossed, the dazzle."""
    w = r * 0.22
    d.polygon([(cx, cy - r), (cx + w, cy), (cx, cy + r), (cx - w, cy)], fill=color)
    d.polygon([(cx - r, cy), (cx, cy - w), (cx + r, cy), (cx, cy + w)], fill=color)


white = (255, 255, 255, 255)
pale = (255, 240, 150, 255)
sparkle(790, 150, 92, white)   # the big one, off the top-right corner
sparkle(880, 300, 48, pale)    # a smaller one below it
sparkle(250, 110, 40, pale)    # a small one off the top-left
sparkle(720, 60, 26, white)    # a tiny one above
img.save(out, "PNG")
print(out, img.size)
