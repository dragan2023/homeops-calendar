/* jest 全局准备：AsyncStorage 用官方内存 mock（真机上才是持久化的） */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
