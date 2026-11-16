# Boston Land Rush

Game bất động sản online, song ngữ Anh/Việt. Thành phố Boston 3D low-poly: mỗi người chơi mua lô 2 ô trong khu Golden Lots (Back Bay), ai mua trước thì được.

An online real-estate game in English and Vietnamese. Buy 2-cell lots in a low-poly 3D Boston; first come, first served.

## Files
- `index.html` — the whole game (three.js r128 from cdnjs). Set `API_URL` at the top of the script to the Apps Script web app URL; leave it empty for offline test mode.
- `Code.gs` — Google Apps Script backend (Users + Lots sheets, LockService so two players can't buy the same lot).

## Deploy the backend
1. New Google Sheet → Extensions → Apps Script → paste `Code.gs` → Save.
2. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
3. Copy the `/exec` URL into `API_URL` in `index.html`.
