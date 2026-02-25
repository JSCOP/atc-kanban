import type { ATCServices, Agent, AgentRole } from '@atc/core';
import { ATCError } from '@atc/core';

/**
 * Validates agent tokens and roles for MCP tool calls.
 */
export function validateAgentToken(services: ATCServices, agentToken: string): Agent {
  return services.agentRegistry.getByToken(agentToken);
}

export function validateMainToken(services: ATCServices, mainToken: string): Agent {
  return services.roleManager.validateMain(mainToken);
}

export function validateWorkerToken(services: ATCServices, agentToken: string): Agent {
  return services.roleManager.validateWorker(agentToken);
}
