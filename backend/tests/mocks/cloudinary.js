// Global Mock for Cloudinary

module.exports = {
  v2: {
    config: jest.fn().mockReturnValue({
      cloud_name: 'mock',
      api_key: 'mock',
      api_secret: 'mock',
    }),
    uploader: {
      upload: jest.fn().mockResolvedValue({
        public_id: 'mocked-id',
        secure_url: 'https://mocked.url/image.jpg',
      }),
      destroy: jest.fn().mockResolvedValue({
        result: 'ok',
      }),
    },
    api: {
      delete_resources: jest.fn().mockResolvedValue({
        deleted: { 'mocked-id': 'deleted' },
      }),
    },
  },
};
