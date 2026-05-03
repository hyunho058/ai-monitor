import json
import os
from datetime import datetime
import glob

def parse_timestamp(ts):
    try:
        if '.' in ts:
            return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ")
        else:
            return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")
    except Exception as e:
        return None

def analyze_session(file_path):
    first_ts = None
    last_ts = None
    tools_used = []
    delegated = False
    completed = False
    plan_first = False
    
    try:
        with open(file_path, 'r') as f:
            lines = f.readlines()
            if not lines:
                return None
            
            # First pass for duration and basic flags
            for i, line in enumerate(lines):
                try:
                    data = json.loads(line)
                except:
                    continue
                    
                ts_str = data.get('timestamp')
                if ts_str:
                    ts = parse_timestamp(ts_str)
                    if ts:
                        if first_ts is None:
                            first_ts = ts
                        last_ts = ts
                
                # Check for tool use
                if data.get('type') == 'assistant':
                    content = data.get('message', {}).get('content', [])
                    for item in content:
                        if isinstance(item, dict) and item.get('type') == 'tool_use':
                            tool_name = item.get('name')
                            tools_used.append(tool_name)
                            
                            # Check for EnterPlanMode at the beginning (roughly first few assistant turns)
                            if len(tools_used) <= 5 and not plan_first:
                                if tool_name in ['EnterPlanMode', 'enter_plan_mode']:
                                    plan_first = True
                            
                            # Check for delegation (invoke_agent)
                            if tool_name == 'invoke_agent':
                                delegated = True
                            
                            # Check for completion (complete_task)
                            if tool_name == 'complete_task':
                                completed = True
    except Exception:
        return None

    if not first_ts or not last_ts:
        return None
        
    duration = (last_ts - first_ts).total_seconds() / 60.0
    
    return {
        'duration': duration,
        'plan_first': plan_first,
        'delegated': delegated,
        'completed': completed,
        'tools_used': tools_used
    }

def main():
    base_dir = "/Users/hyunhokim/.claude/projects/-Users-hyunhokim-IdeaProjects-ai-monitor/"
    if not os.path.exists(base_dir):
        print(json.dumps({"error": f"Directory not found: {base_dir}"}))
        return

    files = glob.glob(os.path.join(base_dir, "*.jsonl"))
    
    analyzed_sessions = []
    
    for f in files:
        res = analyze_session(f)
        if res and res['duration'] >= 20:
            analyzed_sessions.append(res)
            
    count = len(analyzed_sessions)
    if count == 0:
        result = {
            "session_count": 0,
            "plan_first_ratio": 0,
            "delegation_ratio": 0,
            "completion_check_ratio": 0,
            "avg_tools_per_session": 0
        }
    else:
        plan_first_count = sum(1 for s in analyzed_sessions if s['plan_first'])
        delegation_count = sum(1 for s in analyzed_sessions if s['delegated'])
        completion_count = sum(1 for s in analyzed_sessions if s['completed'])
        total_tools = sum(len(s['tools_used']) for s in analyzed_sessions)
        
        result = {
            "session_count": count,
            "plan_first_ratio": plan_first_count / count,
            "delegation_ratio": delegation_count / count,
            "completion_check_ratio": completion_count / count,
            "avg_tools_per_session": total_tools / count
        }
        
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
