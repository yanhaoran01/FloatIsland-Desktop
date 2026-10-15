/* FloatIsland contributors, GPL-3.0. */
/** @file avatarLook.ts @description 连续鼠标目光映射，保持眼睛可见与动作平滑。 @author 鸡哥 */
import type {Look} from '../../vendor/bloub/engine';
/** Maps screen down to negative spherical pitch; clamps at visible eye directions. */
export function avatarPointerLook(x:number,y:number,rect:{left:number;top:number;width:number;height:number}):Look|null {
  if(!Number.isFinite(x+y)||rect.width<=0||rect.height<=0)return null;
  const yaw=Math.atan2(x-rect.left-rect.width/2,rect.width*.8)*180/Math.PI*.65;
  const pitch=-Math.atan2(y-rect.top-rect.height/2,rect.height*.8)*180/Math.PI*.5;
  return {yaw:Math.max(-24,Math.min(24,yaw)),pitch:Math.max(-20,Math.min(20,pitch)),mix:.7,spin:0,wander:0};
}
