// 玩法注册中心：新玩法在此 import + register 即可，引擎与券包无需改动。
import { register } from '../core/rewardEngine.js';
import { checkinPlugin } from './checkin.js';
import { lotteryPlugin } from './lottery.js';
import { taskPlugin } from './task.js';
import { claimPlugin } from './claim.js';

register(checkinPlugin);
register(lotteryPlugin);
register(taskPlugin);
register(claimPlugin);

export const registeredPlayIds = ['checkin', 'lottery', 'task', 'claim'];
