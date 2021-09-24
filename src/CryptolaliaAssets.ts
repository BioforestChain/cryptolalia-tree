import { Injectable } from "@bfchain/util-dep-inject";
import { Storage } from "./Storage";

/**
 * 资源文件
 * 用来存储图片、视频、文件，
 * 根据hash值映射这些文件，
 * 这些资源可能被清理。
 */

@Injectable()
export class CryptolaliaAssets {
  constructor(private storage: Storage) {}

  /// Audio
  addAudio(audio: Uint8Array) {
    this.storage.setBinary(["assets", "audio"], audio);
  }
  /// Video
  addVideo(video: Uint8Array) {
    this.storage.setBinary(["assets", "video"], video);
  }
  /// Document
  addDocument(document: Uint8Array) {
    this.storage.setBinary(["assets", "document"], document);
  }
  /// Picture
  addPicture(picture: Uint8Array) {
    this.storage.setBinary(["assets", "picture"], picture);
  }
  /// Code
  addCode(document: Uint8Array) {
    this.storage.setBinary(["assets", "code"], document);
  }
  /// File
  async addFile(file: Blob) {
    this.storage.setBinary(
      ["assets", file.type],
      new Uint8Array(await file.arrayBuffer()),
    );
  }
}

/**
 * 参考 https://github.com/jshttp/mime-db/blob/master/db.json
 */
const mimeFolderMap = [
  { folder: "audio", mime: [] },
  { folder: "video", mime: [] },
  {
    /// https://en.wikipedia.org/wiki/Document_file_format
    folder: "document",
    mime: [
      "application/pdf",
      /application\/vnd\.ms-powerpoint.*/,
      "application/msword",
      /application\/vnd\.ms-excel.*/,
      /application\/vnd\.openxmlformats-officedocument.*/,
      /application\/vnd\.oasis\.opendocument.+/,
      "application/docbook+xml",
      "application/xhtml+xml",
      "text/rtf",
    ],
  },
  { folder: "picture", mime: [/image\/.*/] },
  {
    folder: "code",
    mime: [
      "application/json",
      /application\/[\w\+]+\+json/,
      "application/xml",
      /application\/[\w\+]+\+xml/,
      "application/json5",
      "application/yaml",
      /application\/[\w\+]+\+yaml/,
      /text\/.*/,
    ],
  },
];
