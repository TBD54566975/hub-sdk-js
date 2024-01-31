import chaiAsPromised from 'chai-as-promised';
import chai, { expect } from 'chai';

import { ArrayUtility } from '../../src/utils/array.js';
import { Cid } from '../../src/utils/cid.js';
import { DataStoreLevel } from '../../src/store/data-store-level.js';
import { DataStream } from '../../src/index.js';
import { TestDataGenerator } from '../utils/test-data-generator.js';

chai.use(chaiAsPromised);

let store: DataStoreLevel;

describe('DataStoreLevel Test Suite', () => {
  before(async () => {
    store = new DataStoreLevel({ blockstoreLocation: 'TEST-DATASTORE' });
    await store.open();
  });

  beforeEach(async () => {
    await store.clear(); // clean up before each test rather than after so that a test does not depend on other tests to do the clean up
  });

  after(async () => {
    await store.close();
  });

  describe('put', function () {
    it('should return the correct size of the data stored', async () => {
      const tenant = await TestDataGenerator.randomCborSha256Cid();
      const recordId = await TestDataGenerator.randomCborSha256Cid();

      let dataSizeInBytes = 10;

      // iterate through order of magnitude in size until hitting 10MB
      while (dataSizeInBytes <= 10_000_000) {
        const dataBytes = TestDataGenerator.randomBytes(dataSizeInBytes);
        const dataStream = DataStream.fromBytes(dataBytes);
        const dataCid = await Cid.computeDagPbCidFromBytes(dataBytes);

        const { dataSize } = await store.put(tenant, recordId, dataCid, dataStream);

        expect(dataSize).to.equal(dataSizeInBytes);

        const result = (await store.get(tenant, recordId, dataCid))!;
        const storedDataBytes = await DataStream.toBytes(result.dataStream);

        expect(storedDataBytes).to.eql(dataBytes);

        dataSizeInBytes *= 10;
      }
    });

    it('should duplicate same data if written to different tenants', async () => {
      const alice = await TestDataGenerator.randomCborSha256Cid();
      const bob = await TestDataGenerator.randomCborSha256Cid();

      const dataBytes = TestDataGenerator.randomBytes(100);
      const dataCid = await Cid.computeDagPbCidFromBytes(dataBytes);

      // write data to alice's DWN
      const aliceDataStream = DataStream.fromBytes(dataBytes);
      const aliceRecordId = await TestDataGenerator.randomCborSha256Cid();
      await store.put(alice, aliceRecordId, dataCid, aliceDataStream);

      // write same data to bob's DWN
      const bobDataStream = DataStream.fromBytes(dataBytes);
      const bobRecordId = await TestDataGenerator.randomCborSha256Cid();
      await store.put(bob, bobRecordId, dataCid, bobDataStream);

      // verify that both alice and bob's blockstore have their own reference to data CID
      const blockstoreOfAliceRecord = await store['getBlockstoreForStoringData'](alice, aliceRecordId, dataCid);
      const blockstoreOfBobRecord = await store['getBlockstoreForStoringData'](bob, bobRecordId, dataCid);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfAliceRecord.db.keys())).to.eventually.eql([ dataCid ]);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfBobRecord.db.keys())).to.eventually.eql([ dataCid ]);
    });
  });

  describe('get', function () {
    it('should return `undefined if unable to find the data specified`', async () => {
      const tenant = await TestDataGenerator.randomCborSha256Cid();
      const recordId = await TestDataGenerator.randomCborSha256Cid();

      const randomCid = await TestDataGenerator.randomCborSha256Cid();
      const result = await store.get(tenant, recordId, randomCid);

      expect(result).to.be.undefined;
    });

    it('should return `undefined` if the dataCid is different than the dataStream`', async () => {
      const tenant = await TestDataGenerator.randomCborSha256Cid();
      const recordId = await TestDataGenerator.randomCborSha256Cid();

      const randomCid = await TestDataGenerator.randomCborSha256Cid();

      const dataBytes = TestDataGenerator.randomBytes(10_000_000);
      const dataStream = DataStream.fromBytes(dataBytes);

      await store.put(tenant, recordId, randomCid, dataStream);

      const result = await store.get(tenant, recordId, randomCid);
      expect(result).to.be.undefined;
    });
  });

  describe('delete', function () {
    it('should not leave anything behind when deleting the root CID', async () => {
      const tenant = await TestDataGenerator.randomCborSha256Cid();
      const recordId = await TestDataGenerator.randomCborSha256Cid();

      const dataBytes = TestDataGenerator.randomBytes(10_000_000);
      const dataStream = DataStream.fromBytes(dataBytes);
      const dataCid = await Cid.computeDagPbCidFromBytes(dataBytes);

      await store.put(tenant, recordId, dataCid, dataStream);

      const keysBeforeDelete = await ArrayUtility.fromAsyncGenerator(store.blockstore.db.keys());
      expect(keysBeforeDelete.length).to.equal(40);

      await store.delete(tenant, recordId, dataCid);

      const keysAfterDelete = await ArrayUtility.fromAsyncGenerator(store.blockstore.db.keys());
      expect(keysAfterDelete.length).to.equal(0);
    });

    it('should only delete data in the sublevel of the corresponding record', async () => {
      const alice = await TestDataGenerator.randomCborSha256Cid();
      const bob = await TestDataGenerator.randomCborSha256Cid();

      const dataBytes = TestDataGenerator.randomBytes(100);
      const dataCid = await Cid.computeDagPbCidFromBytes(dataBytes);

      // alice writes a records with data
      const dataStream1 = DataStream.fromBytes(dataBytes);
      const recordId1 = await TestDataGenerator.randomCborSha256Cid();
      await store.put(alice, recordId1, dataCid, dataStream1);

      // alice writes a different record with same data again
      const dataStream2 = DataStream.fromBytes(dataBytes);
      const recordId2 = await TestDataGenerator.randomCborSha256Cid();
      await store.put(alice, recordId2, dataCid, dataStream2);

      // bob writes a records with same data
      const dataStream3 = DataStream.fromBytes(dataBytes);
      const recordId3 = await TestDataGenerator.randomCborSha256Cid();
      await store.put(bob, recordId3, dataCid, dataStream3);

      // bob writes a different record with same data again
      const dataStream4 = DataStream.fromBytes(dataBytes);
      const recordId4 = await TestDataGenerator.randomCborSha256Cid();
      await store.put(bob, recordId4, dataCid, dataStream4);

      // verify that all 4 records have reference to the same data CID
      const blockstoreOfRecord1 = await store['getBlockstoreForStoringData'](alice, recordId1, dataCid);
      const blockstoreOfRecord2 = await store['getBlockstoreForStoringData'](alice, recordId2, dataCid);
      const blockstoreOfRecord3 = await store['getBlockstoreForStoringData'](bob, recordId3, dataCid);
      const blockstoreOfRecord4 = await store['getBlockstoreForStoringData'](bob, recordId4, dataCid);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord1.db.keys())).to.eventually.eql([ dataCid ]);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord2.db.keys())).to.eventually.eql([ dataCid ]);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord3.db.keys())).to.eventually.eql([ dataCid ]);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord4.db.keys())).to.eventually.eql([ dataCid ]);

      // alice deletes one of the two records
      await store.delete(alice, recordId1, dataCid);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord1.db.keys())).to.eventually.eql([ ]);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord2.db.keys())).to.eventually.eql([ dataCid ]);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord3.db.keys())).to.eventually.eql([ dataCid ]);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord4.db.keys())).to.eventually.eql([ dataCid ]);

      // alice deletes the other record
      await store.delete(alice, recordId2, dataCid);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord1.db.keys())).to.eventually.eql([ ]);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord2.db.keys())).to.eventually.eql([ ]);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord3.db.keys())).to.eventually.eql([ dataCid ]);
      await expect(ArrayUtility.fromAsyncGenerator(blockstoreOfRecord4.db.keys())).to.eventually.eql([ dataCid ]);
    });
  });
});