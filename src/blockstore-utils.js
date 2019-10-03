'use strict'

const base32 = require('base32.js')
const { Key } = require('interface-datastore')
const CID = require('cids')

/**
 * Transform a cid to the appropriate datastore key.
 *
 * @param {Buffer} multihash
 * @returns {Key}
 */
exports.multihashToKey = multihash => {
  const enc = new base32.Encoder()
  return new Key('/' + enc.write(multihash).finalize(), false)
}

/**
 * Transform a datastore Key instance to a CID
 * As Key is a multihash of the CID, it is reconstructed using IPLD's RAW codec.
 * Hence it is highly probable that stored CID will differ from a CID retrieved from blockstore.
 *
 * @param {Key} key
 * @returns {CID}
 */

function keyToCid (key) {
  // Block key is of the form /<base32 encoded string>
  const decoder = new base32.Decoder()
  const buff = decoder.write(key.toString().slice(1)).finalize()
  return new CID(1, 'raw', Buffer.from(buff))
}

exports.keyToCid = keyToCid

/**
 * Transform a datastore Key instance to a multihash instance.
 *
 * @param {Key} key
 * @returns {Buffer}
 */

function keyToMultihash (key) {
  // Block key is of the form /<base32 encoded string>
  const decoder = new base32.Decoder()
  const buff = decoder.write(key.toString().slice(1)).finalize()
  return Buffer.from(buff)
}

exports.keyToMultihash = keyToMultihash

/**
 * Transforms a datastore Key containing multihash to a Key that contains reconstructed CID
 *
 * @param {Key} key
 * @returns {CID}
 */
function keyToCidKey (key) {
  const cid = keyToCid(key)
  const enc = new base32.Encoder()
  return new Key('/' + enc.write(cid.buffer).finalize(), false)
}

exports.keyToCidKey = keyToCidKey
