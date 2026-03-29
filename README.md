# sportsposter

Generate ready-to-post game recaps from MaxPreps box scores.

## Demo

<video src="initial_demo.mov" controls muted></video>

If the video does not render in your viewer, open `initial_demo.mov` directly.

## Quick start

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open `http://localhost:3000` in your browser.

## Usage (HTML paste mode)

This is the most reliable option because MaxPreps often blocks server-side fetches.

1. Open the box score page in your browser while logged in to MaxPreps.
2. Right-click and choose **View Page Source**.
3. Copy all (`Cmd/Ctrl+A`) and paste into the **Box score HTML** field.
4. Click **Generate Summary**.

## Usage (URL mode + cookie)

If you want to paste a URL only, you can provide your MaxPreps session cookie as an environment variable:

```bash
export MAXPREPS_COOKIE="X-MP-UserToken=YOUR_VALUE"
npm start
```

Then paste the MaxPreps box score URL and generate the summary.

## Notes

- This is a basic MVP. It extracts top performers from Passing, Rushing, Receiving, and Tackles tables when available.
- If MaxPreps has not entered stats yet for a team, the summary will omit those players.

- Next steps: need to fix so we can use with just the link. then test with more of the other games on the maxpreps website (right now i just used https://www.maxpreps.com/games/8-23-2025/football-25/chaminade-madonna-vs-st-frances-academy.htm?c=1bE-DCyTtkGt91XdGYhm3w#tab=box-score&schoolid=) 

then try to see if you can demo this to someone at school to see if they are excited by it!! 
