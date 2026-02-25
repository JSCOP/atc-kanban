import type { Agent, AgentRole } from '../types.js';
import { ATCError } from '../types.js';
import type { AgentRegistry } from './agent-registry.js';

/**
 * Validates agent roles and enforces access control.
 */
export class RoleManager {
  private agentRegistry: AgentRegistry;

  constructor(agentRegistry: AgentRegistry) {
    this.agentRegistry = agentRegistry;
  }

  /**
   * Validate that the token belongs to an active agent with the required role.
   */
  validateRole(agentToken: string, requiredRole: AgentRole): Agent {
    const agent = this.agentRegistry.getByToken(agentToken);

    if (agent.role !== requiredRole) {
      throw new ATCError(
        'ROLE_MISMATCH',
        `This operation requires '${requiredRole}' role, but agent has '${agent.role}' role`,
        403,
      );
    }

    return agent;
  }

  /**
   * Validate that the token belongs to a main agent.
   */
  validateMain(mainToken: string): Agent {
    return this.validateRole(mainToken, 'main');
  }

  /**
   * Validate that the token belongs to a worker agent.
   */
  validateWorker(agentToken: string): Agent {
    return this.validateRole(agentToken, 'worker');
  }

  /**
   * Validate that the token belongs to any active agent (main or worker).
   */
  validateAny(agentToken: string): Agent {
    return this.agentRegistry.getByToken(agentToken);
  }
}
