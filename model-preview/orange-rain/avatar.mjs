import {createRainAvatar} from '../rain/avatar.mjs';
/** The orange-cap character genuinely uses the Rain-derived mesh and skeleton. */
export function createOrangeAvatar(){
  return createRainAvatar({assetUrl:new URL('./assets/orange-girl-rain-v1.glb',import.meta.url),name:'OrangeGirl_RainDerivative'});
}
