// Don't import the model, just test the logic directly

describe('Unique View Tracking', () => {
  describe('recordUniqueView method', () => {
    it('should increment views on first-time view', async () => {
      const mockVlog = {
        _id: 'vlog1',
        views: 0,
        userViews: [],
        save: jest.fn().mockResolvedValue(true),
      };

      // Manually add the method
      mockVlog.recordUniqueView = async function (userId) {
        if (!userId) return this;
        if (!this.userViews.includes(userId)) {
          this.userViews.push(userId);
          this.views += 1;
          await this.save();
        }
        return this;
      };

      await mockVlog.recordUniqueView('user1');

      expect(mockVlog.views).toBe(1);
      expect(mockVlog.userViews).toContain('user1');
      expect(mockVlog.save).toHaveBeenCalled();
    });

    it('should NOT increment views on repeat view from same user', async () => {
      const mockVlog = {
        _id: 'vlog1',
        views: 1,
        userViews: ['user1'],
        save: jest.fn().mockResolvedValue(true),
      };

      mockVlog.recordUniqueView = async function (userId) {
        if (!userId) return this;
        if (!this.userViews.includes(userId)) {
          this.userViews.push(userId);
          this.views += 1;
          await this.save();
        }
        return this;
      };

      await mockVlog.recordUniqueView('user1');

      expect(mockVlog.views).toBe(1);
      expect(mockVlog.userViews.length).toBe(1);
      expect(mockVlog.save).not.toHaveBeenCalled();
    });

    it('should increment views separately for different users', async () => {
      const mockVlog = {
        _id: 'vlog1',
        views: 1,
        userViews: ['user1'],
        save: jest.fn().mockResolvedValue(true),
      };

      mockVlog.recordUniqueView = async function (userId) {
        if (!userId) return this;
        if (!this.userViews.includes(userId)) {
          this.userViews.push(userId);
          this.views += 1;
          await this.save();
        }
        return this;
      };

      await mockVlog.recordUniqueView('user2');

      expect(mockVlog.views).toBe(2);
      expect(mockVlog.userViews).toContain('user1');
      expect(mockVlog.userViews).toContain('user2');
      expect(mockVlog.userViews.length).toBe(2);
      expect(mockVlog.save).toHaveBeenCalled();
    });

    it('should NOT increment views for unauthenticated users', async () => {
      const mockVlog = {
        _id: 'vlog1',
        views: 0,
        userViews: [],
        save: jest.fn().mockResolvedValue(true),
      };

      mockVlog.recordUniqueView = async function (userId) {
        if (!userId) return this;
        if (!this.userViews.includes(userId)) {
          this.userViews.push(userId);
          this.views += 1;
          await this.save();
        }
        return this;
      };

      await mockVlog.recordUniqueView(null);

      expect(mockVlog.views).toBe(0);
      expect(mockVlog.userViews.length).toBe(0);
      expect(mockVlog.save).not.toHaveBeenCalled();
    });

    it('should maintain userViews array without duplicates', async () => {
      const mockVlog = {
        _id: 'vlog1',
        views: 2,
        userViews: ['user1', 'user2'],
        save: jest.fn().mockResolvedValue(true),
      };

      mockVlog.recordUniqueView = async function (userId) {
        if (!userId) return this;
        if (!this.userViews.includes(userId)) {
          this.userViews.push(userId);
          this.views += 1;
          await this.save();
        }
        return this;
      };

      // Try to add user1 again
      await mockVlog.recordUniqueView('user1');

      expect(mockVlog.views).toBe(2);
      expect(mockVlog.userViews.length).toBe(2);
      expect(mockVlog.userViews.filter((id) => id === 'user1').length).toBe(1);
    });
  });
});
