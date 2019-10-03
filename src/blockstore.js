'use strict'

const core = require('datastore-core')
const ShardingStore = core.ShardingDatastore
const Block = require('ipfs-block')
const CID = require('cids')
const errcode = require('err-code')
const { multihashToKey, keyToCidKey } = require('./blockstore-utils')

module.exports = async (filestore, options) => {
  const store = await maybeWithSharding(filestore, options)
  return createBaseStore(store)
}

function maybeWithSharding (filestore, options) {
  if (options.sharding) {
    const shard = new core.shard.NextToLast(2)
    return ShardingStore.createOrOpen(filestore, shard)
  }
  return filestore
}

function createBaseStore (store) {
  return {
    /**
     * Query the store.
     *
     * @param {object} query
     * @param {boolean} reconstructsCids - Defines if Keys are converted to a reconstructed CID using IPLD_RAW codec
     * @return {Iterable}
     */
    async * query (query, reconstructsCids = false) {
      for await (const block of store.query(query)) {
        if (reconstructsCids) {
          block.key = keyToCidKey(block.key)
        }

        yield block
      }
    },
    /**
     * Get a single block by CID.
     *
     * @param {CID} cid
     * @returns {Promise<Block>}
     */
    async get (cid) {
      if (!CID.isCID(cid)) {
        throw errcode(new Error('Not a valid cid'), 'ERR_INVALID_CID')
      }
      const key = multihashToKey(cid.multihash)
      const blockData = await store.get(key)
      return new Block(blockData, cid)
    },
    /**
     * Write a single block to the store.
     *
     * @param {Block} block
     * @returns {Promise<void>}
     */
    async put (block) {
      if (!Block.isBlock(block)) {
        throw new Error('invalid block')
      }

      const k = multihashToKey(block.cid.multihash)
      const exists = await store.has(k)
      if (exists) return
      return store.put(k, block.data)
    },

    /**
     * Like put, but for more.
     *
     * @param {AsyncIterable<Block>|Iterable<Block>} blocks
     * @returns {Promise<void>}
     */
    async putMany (blocks) {
      const batch = store.batch()

      for await (const block of blocks) {
        const key = multihashToKey(block.cid.multihash)

        if (await store.has(key)) {
          continue
        }

        batch.put(key, block.data)
      }

      return batch.commit()
    },
    /**
     * Does the store contain block with this multihash or CID?
     *
     * @param {CID|Buffer} obj
     * @returns {Promise<boolean>}
     */
    has (obj) {
      if (CID.isCID(obj)) {
        obj = obj.multihash
      }

      if (!Buffer.isBuffer(obj)) {
        throw errcode(new Error('Not a valid key'), 'ERR_INVALID_KEY')
      }

      return store.has(multihashToKey(obj))
    },
    /**
     * Delete a CID or multihash from the store
     *
     * @param {CID|Buffer} obj
     * @returns {Promise<void>}
     */
    async delete (obj) { // eslint-disable-line require-await
      if (CID.isCID(obj)) {
        obj = obj.multihash
      }

      if (!Buffer.isBuffer(obj)) {
        throw errcode(new Error('Not a valid key'), 'ERR_INVALID_KEY')
      }

      return store.delete(multihashToKey(obj))
    },
    /**
     * Close the store
     *
     * @returns {Promise<void>}
     */
    async close () { // eslint-disable-line require-await
      return store.close()
    }
  }
}
