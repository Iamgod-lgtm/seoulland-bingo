import os
import json
import base64
import time
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

MISSIONS_FILE = os.path.join(DATA_DIR, 'missions.json')
TEAMS_FILE = os.path.join(DATA_DIR, 'teams.json')

BINGO_LINES = [
    [1, 2, 3], [4, 5, 6], [7, 8, 9],  # 가로 3줄
    [1, 4, 7], [2, 5, 8], [3, 6, 9],  # 세로 3줄
    [1, 5, 9], [3, 5, 7]              # 대각선 2줄
]

def load_json(filepath, default_val):
    if not os.path.exists(filepath):
        save_json(filepath, default_val)
        return default_val
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default_val

def save_json(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def calculate_bingo(completed_dict):
    completed_ids = set()
    for mid, info in completed_dict.items():
        if info and (info.get('photoUrl') or info.get('mediaUrl')):
            try:
                completed_ids.add(int(mid))
            except ValueError:
                pass

    
    bingo_count = 0
    completed_lines = []
    for line in BINGO_LINES:
        if all(m in completed_ids for m in line):
            bingo_count += 1
            completed_lines.append(line)
            
    return bingo_count, completed_lines, len(completed_ids)

class BingoHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, status_code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # API 요청 처리
        if path == '/api/missions':
            missions = load_json(MISSIONS_FILE, [])
            self.send_json(200, {"success": True, "missions": missions})
            return

        if path == '/api/teams':
            teams_data = load_json(TEAMS_FILE, {"teams": []})
            self.send_json(200, {"success": True, "teams": teams_data.get("teams", [])})
            return

        if path == '/api/team':
            params = parse_qs(parsed.query)
            team_id = params.get('id', [None])[0]
            if not team_id:
                self.send_json(400, {"success": False, "message": "team id required"})
                return
            teams_data = load_json(TEAMS_FILE, {"teams": []})
            target = next((t for t in teams_data.get("teams", []) if t["id"] == team_id), None)
            if target:
                self.send_json(200, {"success": True, "team": target})
            else:
                self.send_json(404, {"success": False, "message": "Team not found"})
            return

        # 정적 파일 서빙
        if path == '/' or path == '/index.html':
            self.serve_file(os.path.join(PUBLIC_DIR, 'index.html'))
            return
        elif path == '/admin' or path == '/admin.html':
            self.serve_file(os.path.join(PUBLIC_DIR, 'admin.html'))
            return
        elif path.startswith('/uploads/'):
            filename = os.path.basename(path)
            self.serve_file(os.path.join(UPLOADS_DIR, filename))
            return
        else:
            # public 디렉토리 내 정적 파일 (css, js, images 등)
            rel_path = path.lstrip('/')
            file_path = os.path.join(PUBLIC_DIR, rel_path)
            if os.path.exists(file_path) and os.path.isfile(file_path):
                self.serve_file(file_path)
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"404 Not Found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(length)
        try:
            body = json.loads(post_data.decode('utf-8'))
        except Exception:
            body = {}

        if path == '/api/missions':
            new_missions = body.get('missions')
            if isinstance(new_missions, list) and len(new_missions) == 9:
                save_json(MISSIONS_FILE, new_missions)
                self.send_json(200, {"success": True, "missions": new_missions})
            else:
                self.send_json(400, {"success": False, "message": "9 missions required"})
            return

        if path == '/api/team_members':
            team_id = body.get('teamId')
            members = body.get('members', '').strip()
            if not team_id:
                self.send_json(400, {"success": False, "message": "teamId is required"})
                return
            teams_data = load_json(TEAMS_FILE, {"teams": []})
            team = next((t for t in teams_data.get("teams", []) if t["id"] == team_id), None)
            if team:
                team["members"] = members
                save_json(TEAMS_FILE, teams_data)
                self.send_json(200, {"success": True, "team": team})
            else:
                self.send_json(404, {"success": False, "message": "Team not found"})
            return


        if path == '/api/upload':
            team_id = body.get('teamId')
            mission_id = body.get('missionId')
            media_b64 = body.get('mediaBase64') or body.get('imageBase64')
            media_type = body.get('mediaType', 'image')

            if not team_id or not mission_id or not media_b64:
                self.send_json(400, {"success": False, "message": "Missing required fields"})
                return

            ext = 'jpg'
            try:
                if 'data:' in media_b64 and ';base64,' in media_b64:
                    header, media_b64 = media_b64.split(';base64,', 1)
                    mime = header.replace('data:', '').lower()
                    if 'video' in mime:
                        media_type = 'video'
                        if 'webm' in mime: ext = 'webm'
                        elif 'mov' in mime or 'quicktime' in mime: ext = 'mov'
                        else: ext = 'mp4'
                    elif 'image' in mime:
                        media_type = 'image'
                        if 'png' in mime: ext = 'png'
                        elif 'gif' in mime: ext = 'gif'
                        elif 'webp' in mime: ext = 'webp'
                        else: ext = 'jpg'
                elif ',' in media_b64:
                    media_b64 = media_b64.split(',', 1)[1]

                media_bytes = base64.b64decode(media_b64)
            except Exception as e:
                self.send_json(400, {"success": False, "message": f"Invalid media data: {str(e)}"})
                return

            timestamp = int(time.time() * 1000)
            filename = f"{team_id}_m{mission_id}_{timestamp}.{ext}"
            filepath = os.path.join(UPLOADS_DIR, filename)

            with open(filepath, 'wb') as f:
                f.write(media_bytes)

            media_url = f"/uploads/{filename}"
            teams_data = load_json(TEAMS_FILE, {"teams": []})
            team = next((t for t in teams_data.get("teams", []) if t["id"] == team_id), None)

            if not team:
                self.send_json(404, {"success": False, "message": "Team not found"})
                return

            if "completed" not in team:
                team["completed"] = {}

            team["completed"][str(mission_id)] = {
                "photoUrl": media_url,
                "mediaUrl": media_url,
                "mediaType": media_type,
                "timestamp": timestamp
            }


            bingo_count, completed_lines, completed_count = calculate_bingo(team["completed"])
            team["bingoCount"] = bingo_count
            team["completedLines"] = completed_lines
            team["completedCount"] = completed_count
            team["lastUpdated"] = timestamp

            save_json(TEAMS_FILE, teams_data)

            self.send_json(200, {
                "success": True,
                "team": team,
                "bingoCount": bingo_count,
                "completedLines": completed_lines
            })
            return

        if path == '/api/delete_photo':
            team_id = body.get('teamId')
            mission_id = body.get('missionId')
            teams_data = load_json(TEAMS_FILE, {"teams": []})
            team = next((t for t in teams_data.get("teams", []) if t["id"] == team_id), None)
            if team and str(mission_id) in team.get("completed", {}):
                del team["completed"][str(mission_id)]
                bingo_count, completed_lines, completed_count = calculate_bingo(team["completed"])
                team["bingoCount"] = bingo_count
                team["completedLines"] = completed_lines
                team["completedCount"] = completed_count
                team["lastUpdated"] = int(time.time() * 1000)
                save_json(TEAMS_FILE, teams_data)
                self.send_json(200, {"success": True, "team": team})
            else:
                self.send_json(400, {"success": False, "message": "Photo not found"})
            return

        if path == '/api/reset':
            team_id = body.get('teamId')
            clear_members = body.get('clearMembers', False)
            teams_data = load_json(TEAMS_FILE, {"teams": []})
            if team_id == 'all':
                for t in teams_data.get("teams", []):
                    t["completed"] = {}
                    t["bingoCount"] = 0
                    t["completedLines"] = []
                    t["completedCount"] = 0
                    t["lastUpdated"] = 0
                    if clear_members:
                        t["members"] = ""
            else:
                team = next((t for t in teams_data.get("teams", []) if t["id"] == team_id), None)
                if team:
                    team["completed"] = {}
                    team["bingoCount"] = 0
                    team["completedLines"] = []
                    team["completedCount"] = 0
                    team["lastUpdated"] = 0
                    if clear_members:
                        team["members"] = ""
            save_json(TEAMS_FILE, teams_data)
            self.send_json(200, {"success": True, "teams": teams_data.get("teams", [])})
            return


        self.send_response(404)
        self.end_headers()

    def serve_file(self, filepath):
        if not os.path.exists(filepath):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"File not found")
            return

        mime_type, _ = mimetypes.guess_type(filepath)
        if not mime_type:
            mime_type = 'application/octet-stream'

        try:
            with open(filepath, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', mime_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(f"Server error: {e}".encode('utf-8'))

def run_server(port=8080):
    server_address = ('', port)
    httpd = HTTPServer(server_address, BingoHandler)
    print(f"==================================================")
    print(f"  서울랜드 체험학습 빙고 이벤트 서버 실행 중!")
    print(f"  - 학생용 화면:   http://localhost:{port}")
    print(f"  - 선생님 관리자: http://localhost:{port}/admin")
    print(f"==================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
        httpd.server_close()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    run_server(port)

