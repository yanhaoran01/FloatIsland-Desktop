/* FloatIsland - https://github.com/yanhaoran01/FloatIsland
 * Copyright (C) 2026 contributors. GPL-3.0.
 * Event rules adapted from joyparkray/agent-avatar (MIT), pinned 234ec92c. */
/** @file workBuddyObserver.ts @description Pure WorkBuddy observer with late-start and concurrent-tool bookkeeping. @author 鸡哥 */
import type {FusionEchoCodexSession} from '../../preload/types/fusion';
type Event=Record<string,unknown>;
interface Session {value:FusionEchoCodexSession;tools:Map<string,string>;agents:Set<string>;seen:Set<string>;closed:boolean;failed:boolean;}
const string=(value:unknown):string=>typeof value==='string'?value:'';
/** Keeps WorkBuddy observation separate from interactive approval channels. */
export class WorkBuddyObserver {
  private sessions=new Map<string,Session>();
  /** Imports historical metadata as disconnected, never as a completed/live task. */
  restore(values:FusionEchoCodexSession[]):void {
    for(const value of values)if(!this.sessions.has(value.sessionId))this.sessions.set(value.sessionId,{value:{...value,status:'Restored',source:'workbuddy'},tools:new Map(),agents:new Set(),seen:new Set(),closed:false,failed:false});
  }
  /** Applies real hook events, deduplicates stable IDs, and preserves late SessionStart state. */
  accept(event:Event):boolean {
    const id=string(event.session_id),name=string(event.hook_event_name);if(!id||!name)return false;
    let session=this.sessions.get(id);
    if(!session){session={value:{sessionId:id,key:'workbuddy:'+id,source:'workbuddy',cwd:null,projectName:null,model:null,status:'Restored',currentTool:null,lastUserPrompt:null,lastAssistantMessage:null,lastActivity:null,windowTitle:null,capabilities:{focus:true,chat:false,approve:false},toolHistory:[]},tools:new Map(),agents:new Set(),seen:new Set(),closed:false,failed:false};this.sessions.set(id,session);}
    const stamp=string(event.timestamp),toolId=string(event.tool_use_id)||string(event.tool_call_id);
    const key=string(event.event_id)||(stamp?[name,stamp,toolId,string(event.agent_id)].join(':'):'');
    if(key&&session.seen.has(key))return false;
    if(key){session.seen.add(key);if(session.seen.size>512)session.seen.delete(session.seen.values().next().value!);}
    // SessionStart is delivered after the prompt in WorkBuddy; it is metadata, not a reset.
    if(session.closed&&name!=='UserPromptSubmit')return false;
    const value=session.value;
    if(typeof event.cwd==='string')value.cwd=event.cwd;
    if(typeof event.model==='string')value.model=event.model;
    value.lastActivity=stamp||new Date().toISOString();
    const tool=string(event.tool_name),notification=string(event.notification_type);
    switch(name){
      case 'SessionStart':if(value.status==='Restored')value.status='Idle';break;
      case 'UserPromptSubmit':session.closed=false;session.failed=false;session.tools.clear();session.agents.clear();value.status='Processing';if(typeof event.prompt==='string')value.lastUserPrompt=event.prompt;break;
      case 'PreToolUse':session.tools.set(toolId||tool||'tool',tool);value.status='Running';value.currentTool=tool||null;break;
      case 'PostToolUse':case 'PostToolUseFailure':
        session.tools.delete(toolId||tool||'tool');value.currentTool=[...session.tools.values()].at(-1)??null;
        if(name==='PostToolUseFailure')session.failed=true;
        value.status=session.tools.size?'Running':'Processing';break;
      case 'SubagentStart':session.agents.add(string(event.agent_id)||toolId||'agent');value.status='Processing';break;
      case 'SubagentStop':{const agent=string(event.agent_id);if(agent)session.agents.delete(agent);value.status=session.tools.size?'Running':'Processing';break;}
      case 'PermissionRequest':case 'Elicitation':value.status='WaitingApproval';break;
      case 'Notification':if(['permission_prompt','elicitation_dialog'].includes(notification))value.status='WaitingApproval';else if(notification==='idle_prompt'&&!session.tools.size&&!session.agents.size)value.status='Idle';break;
      case 'PermissionDenied':case 'StopFailure':session.failed=true;session.tools.clear();session.agents.clear();value.currentTool=null;break;
      case 'Stop':
        if(session.tools.size||session.agents.size)break;
        value.status='Completed';value.currentTool=null;break;
      case 'SessionEnd':session.closed=true;session.tools.clear();session.agents.clear();value.status='Restored';value.currentTool=null;break;
      default:return false;
    }
    if(session.failed&&!session.closed)value.status='Error';
    return true;
  }
  /** Removes live activity after a real process disappearance; does not signal completion. */
  disconnect(ids?:Set<string>):void {for(const [id,session] of this.sessions){if(ids&&!ids.has(id))continue;session.value.status='Restored';session.value.currentTool=null;session.tools.clear();session.agents.clear();session.closed=true;session.failed=false;}}
  /** Returns isolated snapshots ordered by most recent activity. */
  snapshot():FusionEchoCodexSession[] {return structuredClone([...this.sessions.values()].map(session=>session.value).sort((a,b)=>(b.lastActivity??'').localeCompare(a.lastActivity??'')));}
}
