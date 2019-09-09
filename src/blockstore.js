'use strict'

const core = require('datastore-core')
const ShardingStore = core.ShardingDatastore
const Block = require('ipfs-block')
const CID = require('cids')
const errcode = require('err-code')
const callbackify = require('callbackify')
const { cidToKey } = require('./blockstore-utils')

module.exports = async (filestore, options) => {
  const store = await maybeWithSharding(filestore, options)
  return CallbackifiedCreateBaseStore(store)
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
     * @return {Iterable}
     */
    async * query (query) {
      for await (const block of store.query(query)) {
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
      const key = cidToKey(cid)
      let blockData
      try {
        blockData = await store.get(key)
        return new Block(blockData, cid)
      } catch (err) {
        if (err.code === 'ERR_NOT_FOUND') {
          const otherCid = cidToOtherVersion(cid)

          if (!otherCid) {
            throw err
          }

          const otherKey = cidToKey(otherCid)
          const blockData = await store.get(otherKey)
          await store.put(key, blockData)
          return new Block(blockData, cid)
        }

        throw err
      }
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

      const k = cidToKey(block.cid)
      const exists = await store.has(k)
      if (exists) return
      return store.put(k, block.data)
    },

    /**
     * Like put, but for more.
     *
     * @param {Array<Block>} blocks
     * @returns {Promise<void>}
     */
    async putMany (blocks) {
      const keys = blocks.map((b) => ({
        key: cidToKey(b.cid),
        block: b
      }))

      const batch = store.batch()

      await Promise.all(
        keys.map(async k => {
          if (await store.has(k.key)) {
            return
          }

          batch.put(k.key, k.block.data)
        })
      )

      return batch.commit()
    },
    /**
     * Does the store contain block with this cid?
     *
     * @param {CID} cid
     * @returns {Promise<bool>}
     */
    async has (cid) {
      if (!CID.isCID(cid)) {
        throw errcode(new Error('Not a valid cid'), 'ERR_INVALID_CID')
      }

      const exists = await store.has(cidToKey(cid))
      if (exists) return exists
      const otherCid = cidToOtherVersion(cid)
      if (!otherCid) return false
      return store.has(cidToKey(otherCid))
    },
    /**
     * Delete a block from the store
     *
     * @param {CID} cid
     * @returns {Promise<void>}
     */
    async delete (cid) { // eslint-disable-line require-await
      if (!CID.isCID(cid)) {
        throw errcode(new Error('Not a valid cid'), 'ERR_INVALID_CID')
      }
      return store.delete(cidToKey(cid))
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

function CallbackifiedCreateBaseStore (store) {
  const baseStore = createBaseStore(store)
  return {
    query: callbackify(baseStore.query),
    get: callbackify(baseStore.get),
    put: callbackify(baseStore.put),
    putMany: callbackify(baseStore.putMany),
    has: callbackify(baseStore.has),
    delete: callbackify(baseStore.delete),
    close: callbackify(baseStore.close)
  }
}

function cidToOtherVersion (cid) {
  try {
    return cid.version === 0 ? cid.toV1() : cid.toV0()
  } catch (err) {
    return null
  }
}
