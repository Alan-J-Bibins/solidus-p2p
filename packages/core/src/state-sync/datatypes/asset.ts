/**
 * A reference to binary data stored outside the synchronized state.
 *
 * The Asset itself intentionally does not contain the binary payload.
 * It only describes the asset so that state synchronization can pass a
 * lightweight reference instead of copying the binary data through state.
Asset
├── id       → identifies the binary asset
├── size     → size of the binary
├── type     → MIME type, e.g. image/png
└── name     → optional filename
*/

export class Asset {
    readonly id: string;
    readonly size: number;
    readonly type: string;
    readonly name?: string;

    constructor(id: string, size: number, type: string, name?: string) {
        this.id = id;
        this.size = size;
        this.type = type;
        this.name = name;
    }
}
