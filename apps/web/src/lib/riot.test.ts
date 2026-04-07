import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set up env vars before imports
process.env.RIOT_API_KEY = 'test-key';

import { 
  getRoutingRegion, 
  uIRegionToPlatform, 
  getAccountByRiotId, 
  getSummonerByPuuid, 
  getLeagueEntries,
  getAccountByPuuid,
  getSummonerById
} from './riot';

// Mock global fetch
global.fetch = vi.fn();

describe('Riot API lib', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Region Mapping', () => {
    it('returns the correct routing region for a given platform', () => {
      expect(getRoutingRegion('na1')).toBe('americas');
      expect(getRoutingRegion('euw1')).toBe('europe');
      expect(getRoutingRegion('kr')).toBe('asia');
      expect(getRoutingRegion('tw2')).toBe('sea');
    });

    it('defaults to americas for unknown platform', () => {
      expect(getRoutingRegion('unknown_platform')).toBe('americas');
    });
    
    it('correctly maps UI regions to platform IDs', () => {
      expect(uIRegionToPlatform['NA']).toBe('na1');
      expect(uIRegionToPlatform['EUW']).toBe('euw1');
      expect(uIRegionToPlatform['KR']).toBe('kr');
    });
  });

  describe('API Calls', () => {
    it('getAccountByRiotId constructs the right URL and returns data', async () => {
      const mockData = {
        puuid: 'test-puuid',
        gameName: 'Hide on bush',
        tagLine: 'KR1'
      };
      
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockData
      });

      const result = await getAccountByRiotId('Hide on bush', 'KR1', 'asia');
      
      expect(fetch).toHaveBeenCalledWith(
        'https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Hide%20on%20bush/KR1',
        expect.objectContaining({
          headers: { 'X-Riot-Token': expect.any(String) }
        })
      );
      expect(result).toEqual(mockData);
    });

    it('getAccountByRiotId returns null on 404', async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await getAccountByRiotId('DoesntExist', 'NA1', 'americas');
      expect(result).toBeNull();
    });

    it('getSummonerByPuuid constructs the right URL and returns data', async () => {
      const mockData = { id: 'summoner-id', summonerLevel: 30 };
      
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockData
      });

      const result = await getSummonerByPuuid('test-puuid', 'na1');
      
      expect(fetch).toHaveBeenCalledWith(
        'https://na1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/test-puuid',
        expect.objectContaining({
          headers: expect.any(Object)
        })
      );
      expect(result).toEqual(mockData);
    });

    it('getLeagueEntries constructs the right URL', async () => {
      const mockData = [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD' }];
      
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockData
      });
      const result = await getLeagueEntries('test-puuid', 'na1');
      
      expect(fetch).toHaveBeenCalledWith(
        'https://na1.api.riotgames.com/lol/league/v4/entries/by-puuid/test-puuid',
        expect.objectContaining({
          headers: expect.any(Object)
        })
      );
      expect(result).toEqual(mockData);
    });

    it('getAccountByPuuid constructs the right URL and returns data', async () => {
      const mockData = { gameName: 'Test', tagLine: '123' };
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockData
      });

      const result = await getAccountByPuuid('test-puuid', 'na1');

      expect(fetch).toHaveBeenCalledWith(
        'https://americas.api.riotgames.com/riot/account/v1/accounts/by-puuid/test-puuid',
        expect.objectContaining({
          headers: { 'X-Riot-Token': expect.any(String) }
        })
      );
      expect(result).toEqual(mockData);
    });

    it('getSummonerById constructs the right URL and returns data', async () => {
      const mockData = { id: 'summoner-1', puuid: 'test-puuid' };
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockData
      });

      const result = await getSummonerById('summoner-1', 'euw1');

      expect(fetch).toHaveBeenCalledWith(
        'https://euw1.api.riotgames.com/lol/summoner/v4/summoners/summoner-1',
        expect.objectContaining({
          headers: { 'X-Riot-Token': expect.any(String) }
        })
      );
      expect(result).toEqual(mockData);
    });
  });
});
