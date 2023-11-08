import axios from 'axios';
import { BigNumber, ethers } from "ethers";
import LooksRareProtocol from "./abi/ILooksRareProtocol.json"
import 'dotenv/config';

const LOOKSRARE_APIKEY = process.env.LOOKSRARE;

type OrderInfo = {
    id: string;
    hash: string;
    quoteType: number;
    globalNonce: string;
    subsetNonce: string;
    orderNonce: string;
    collection: string;
    currency: string;
    signer: string;
    strategyId: number;
    collectionType: number;
    startTime: number;
    endTime: number;
    price: string;
    additionalParameters: string;
    signature: string;
    merkleRoot: string;
    merkleProof: Array<string>;
    amounts: Array<string>;
    itemIds: Array<string>;
}

async function getListingOrder(collection: string, tokenId: string): Promise<OrderInfo> {
    const res = await axios.get('https://api.looksrare.org/api/v2/orders', {
        headers: {
            "accept": "application/json",
            "X-Looks-Api-Key": LOOKSRARE_APIKEY
        },
        params: {
            quoteType: 1,
            collection: collection,
            itemId: tokenId,
            status: "VALID",
            sort: "PRICE_ASC"
        }
    });
    const orderInfo = res.data.data[0];
    return orderInfo;
}

type TxInfo = {
    to: string;
    data: string;
    value: BigNumber;
}
async function generateData(recipient: string, orderInfos: Array<OrderInfo>): Promise<TxInfo> {
    const takerBids = [];
    const makerAsks = [];
    const makerSignatures = [];
    const merkleTrees = [];
    let value = BigNumber.from("0");
    for (let i = 0; i < orderInfos.length; i++) {
        takerBids.push({
            recipient: recipient,
            additionalParameters: "0x",
        });
        const orderInfo = orderInfos[i];
        value = value.add(BigNumber.from(orderInfo.price));
        makerAsks.push({
            quoteType: orderInfo.quoteType,
            globalNonce: orderInfo.globalNonce,
            subsetNonce: orderInfo.subsetNonce,
            orderNonce: orderInfo.orderNonce,
            strategyId: orderInfo.strategyId,
            collectionType: orderInfo.collectionType,
            collection: orderInfo.collection,
            currency: orderInfo.currency,
            signer: orderInfo.signer,
            startTime: orderInfo.startTime,
            endTime: orderInfo.endTime,
            price: orderInfo.price,
            itemIds: orderInfo.itemIds,
            amounts: orderInfo.amounts,
            additionalParameters: orderInfo.additionalParameters,
        });

        makerSignatures.push(orderInfo.signature);

        merkleTrees.push({
            root: "0x0000000000000000000000000000000000000000000000000000000000000000",
            proof: []
        });
    }

    const affiliate = ethers.constants.AddressZero;
    const isAtomic = true;

    const iface = new ethers.utils.Interface(LooksRareProtocol.abi);
    const data = iface.encodeFunctionData("executeMultipleTakerBids", [
        takerBids,
        makerAsks,
        makerSignatures,
        merkleTrees,
        affiliate,
        isAtomic
    ]);
    return {
        to: "0x0000000000E655fAe4d56241588680F86E3b2377",
        data: data,
        value: value
    };
}

async function main() {
    const collection = "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85";
    const tokenId = "45868634791922588841655926470225153832807706348006797365649100771213260292437";
    const orderInfo = await getListingOrder(collection, tokenId);
    const orderInfo2 = await getListingOrder(collection, "86763760445602969287358008062863477733410050902602302063386284094043653032294");
    const recipient = ethers.constants.AddressZero;
    const orderInfos = [orderInfo, orderInfo2];
    const txInfo = await generateData(recipient, orderInfos);
    console.log(txInfo);
}
main();
