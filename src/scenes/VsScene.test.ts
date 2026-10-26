import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../core/GameContext';
import { createSession } from '../core/session';
import { emptyAssets, type CharacterAssets } from '../rendering/CharacterAssets';
import { BattleScene } from './BattleScene';
import { CharacterSelectScene } from './CharacterSelectScene';
import { VsScene } from './VsScene';

const mocks = vi.hoisted(() => ({ load: vi.fn(), stages: vi.fn() }));
vi.mock('../rendering/CharacterAssets', async (original) => ({
  ...await original<typeof import('../rendering/CharacterAssets')>(),
  loadCharacterAssets: mocks.load,
}));
vi.mock('../rendering/stageRenderer', async (original) => ({
  ...await original<typeof import('../rendering/stageRenderer')>(),
  preloadStages: mocks.stages,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
function sprite(id: string): CharacterAssets {
  return { ...emptyAssets(id), portrait: { width: 512, height: 512 } as HTMLImageElement };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function setup() {
  const pressed = new Set<string>();
  const context = {
    session: createSession(),
    input: { anyPressed: (action: string) => pressed.has(action) },
    assets: { loadImage: vi.fn().mockResolvedValue(null), image: () => null },
    setScene: vi.fn(),
  } as unknown as GameContext;
  const scene = new VsScene();
  scene.enter(context);
  return { scene, context, pressed };
}

beforeEach(() => { mocks.load.mockReset(); mocks.stages.mockReset().mockResolvedValue(undefined); });

describe('VS asset readiness gate', () => {
  it('never starts an empty battle at ten seconds; uses assets when they arrive late', async () => {
    const late = deferred<CharacterAssets>();
    const a = sprite('tyrannosaurus'); const b = sprite('triceratops');
    mocks.load.mockReturnValueOnce(Promise.resolve(a)).mockReturnValueOnce(late.promise);
    const { scene, context, pressed } = setup();
    await flush();
    pressed.add('confirm');
    scene.update(10.1, context);
    expect(context.setScene).not.toHaveBeenCalled();
    late.resolve(b); await flush(); scene.update(0.02, context);
    const battle = vi.mocked(context.setScene).mock.calls[0]?.[0];
    expect(battle).toBeInstanceOf(BattleScene);
    expect((battle as unknown as { characterAssets: unknown }).characterAssets).toEqual([a, b]);
  });

  it('waits for a slow stage too instead of losing already loaded characters', async () => {
    const late = deferred<void>(); mocks.stages.mockReturnValue(late.promise);
    mocks.load.mockImplementation(async (_loader, id) => sprite(id));
    const { scene, context } = setup(); await flush(); scene.update(20, context);
    expect(context.setScene).not.toHaveBeenCalled();
    late.resolve(); await flush(); scene.update(0.02, context);
    expect(context.setScene).toHaveBeenCalledWith(expect.any(BattleScene));
  });

  it('retains the normal ready/skip flow', async () => {
    mocks.load.mockImplementation(async (_loader, id) => sprite(id));
    const { scene, context, pressed } = setup(); await flush();
    scene.update(0.5, context); expect(context.setScene).not.toHaveBeenCalled();
    pressed.add('confirm'); scene.update(0.02, context);
    expect(context.setScene).toHaveBeenCalledWith(expect.any(BattleScene));
  });

  it('blocks missing sprites and permits a successful retry', async () => {
    mocks.load.mockImplementation(async (_loader, id) => emptyAssets(id));
    const { scene, context, pressed } = setup(); await flush(); scene.update(20, context);
    expect(context.setScene).not.toHaveBeenCalled();
    mocks.load.mockImplementation(async (_loader, id) => sprite(id));
    pressed.add('confirm'); scene.update(0.02, context); pressed.clear();
    await flush(); scene.update(2.3, context);
    expect(context.setScene).toHaveBeenCalledWith(expect.any(BattleScene));
  });

  it('catches load errors and stays out of battle', async () => {
    mocks.load.mockRejectedValue(new Error('invalid rig'));
    const { scene, context } = setup(); await flush(); scene.update(20, context);
    expect(context.setScene).not.toHaveBeenCalled();
  });

  it('allows cancellation during a stalled load and ignores its late result', async () => {
    const late = deferred<CharacterAssets>(); mocks.load.mockReturnValue(late.promise);
    const { scene, context, pressed } = setup(); pressed.add('cancel'); scene.update(0.02, context);
    expect(context.setScene).toHaveBeenCalledWith(expect.any(CharacterSelectScene));
    scene.exit(); late.resolve(sprite('tyrannosaurus')); await flush();
    expect((scene as unknown as { characterAssets: unknown }).characterAssets).toBeNull();
  });
});
