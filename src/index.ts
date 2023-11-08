import { BigNumber, ethers } from "ethers";
import { OpenSeaSDK, Chain } from "opensea-js";
import 'dotenv/config';
import { OrderSide } from "opensea-js/lib/orders/types";
import Seaport from "./abi/ISeaport.json"

const NETWORK = process.env.MAINNET_NETWORK;
const SEAPORT_APIKEY = process.env.SEAPORT;
const provider = new ethers.providers.JsonRpcProvider(NETWORK);
const apiConfig = {
    chain: Chain.Mainnet,
    apiKey: SEAPORT_APIKEY,
};

type OrderInfo = {
    orderHash: string;
    protocolAddress: string;
    tokenId: string;
    currentPrice: BigNumber;
    side: OrderSide;
}

type TxInfo = {
    data: string;
    value: BigNumber;
}

async function getListingOrders(client: OpenSeaSDK, nftContract: string, nftIds: Array<string>): Promise<Array<OrderInfo>> {
    const result = await client.api.getOrders({
        side: "ask",
        protocol: "seaport",
        orderBy: "eth_price",
        orderDirection: "asc",
        assetContractAddress: nftContract,
        tokenIds: nftIds
    });
    const orderInfos: Array<OrderInfo> = [];
    const tokenIds = new Set();
    for (let i = 0; i < result.orders.length; i++) {
        const order = result.orders[i];
        const tokenId = order.protocolData.parameters.offer[0].identifierOrCriteria;
        if (!tokenIds.has(tokenId)) {
            tokenIds.add(tokenId);
            orderInfos.push({
                orderHash: order.orderHash!,
                protocolAddress: order.protocolAddress,
                tokenId: order.protocolData.parameters.offer[0].identifierOrCriteria!,
                currentPrice: order.currentPrice!,
                side: order.side
            });
        }
    }
    return orderInfos;
}

async function generateData(client: OpenSeaSDK, fulfillerAddress: string, orderInfos: Array<OrderInfo>): Promise<TxInfo> {
    const iface = new ethers.utils.Interface(Seaport.abi);
    const advancedOrders = [];
    const criteriaResolvers: Array<any> = [];
    const offerFulfillments = [];
    const considerationFulfillments = [];
    const fulfillerConduitKey = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const recipient = fulfillerAddress;
    const orderInfosLength = orderInfos.length;
    const maximumFulfilled = 32 * orderInfosLength;
    let value = ethers.BigNumber.from("0");
    for (let i = 0; i < orderInfosLength; i++) {
        const data = await client.api.generateFulfillmentData(
            fulfillerAddress,
            orderInfos[i].orderHash!,
            orderInfos[i].protocolAddress,
            orderInfos[i].side
        );
        const transaction = data.fulfillment_data.transaction;
        value = value.add(ethers.BigNumber.from(transaction.value));
        const inputdata = JSON.parse(JSON.stringify(transaction.input_data));

        const consideration = [
            {
                itemType: 0,
                token: inputdata.parameters.considerationToken,
                identifierOrCriteria: inputdata.parameters.considerationIdentifier,
                startAmount: inputdata.parameters.considerationAmount,
                endAmount: inputdata.parameters.considerationAmount,
                recipient: inputdata.parameters.offerer
            }
        ];
        const length = inputdata.parameters.additionalRecipients.length;
        for (let i = 0; i < length; i++) {
            consideration.push({
                itemType: 0,
                token: inputdata.parameters.considerationToken,
                identifierOrCriteria: inputdata.parameters.considerationIdentifier,
                startAmount: inputdata.parameters.additionalRecipients[i].amount,
                endAmount: inputdata.parameters.additionalRecipients[i].amount,
                recipient: inputdata.parameters.additionalRecipients[i].recipient
            });
        }

        advancedOrders.push({
            parameters: {
                offerer: inputdata.parameters.offerer,
                zone: inputdata.parameters.zone,
                offer: [{
                    itemType: 2,
                    token: inputdata.parameters.offerToken,
                    identifierOrCriteria: inputdata.parameters.offerIdentifier,
                    startAmount: inputdata.parameters.offerAmount,
                    endAmount: inputdata.parameters.offerAmount
                }],
                consideration: consideration,
                orderType: 0,
                startTime: inputdata.parameters.startTime,
                endTime: inputdata.parameters.endTime,
                zoneHash: inputdata.parameters.zoneHash,
                salt: inputdata.parameters.salt,
                conduitKey: inputdata.parameters.offererConduitKey,
                totalOriginalConsiderationItems: length + 1
            },
            numerator: 1,
            denominator: 1,
            signature: inputdata.parameters.signature,
            extraData: "0x"
        });

        offerFulfillments.push([{
            orderIndex: i,
            itemIndex: 0
        }]);

        for (let j = 0; j < consideration.length; j++) {
            considerationFulfillments.push([{
                orderIndex: i,
                itemIndex: j
            }]);
        }
    }

    const fulfillData = iface.encodeFunctionData("fulfillAvailableAdvancedOrders", [
        advancedOrders,
        criteriaResolvers,
        offerFulfillments,
        considerationFulfillments,
        fulfillerConduitKey,
        recipient,
        maximumFulfilled
    ]);
    return {
        data: fulfillData,
        value: value
    };
}

async function main() {
    const client = new OpenSeaSDK(provider, apiConfig);
    const nftContract = "0xecefc7f8105119b2fcdbe8616b5d0e42c14fdc6d";
    const tokenIds = ["215", "1776"];
    const fulfillerAddress = ethers.constants.AddressZero;
    const orderInfos = await getListingOrders(client, nftContract, tokenIds);
    const txInfo = await generateData(client, fulfillerAddress, orderInfos);
    console.log(txInfo);
}

main();
