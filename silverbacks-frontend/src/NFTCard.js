import React, { useState } from "react";
import { ethers } from "ethers";

const NFTCard = ({
  nft,
  pk,
  handleRedeemTo,
  handleClaimNFT,
  handleRedeem,
  handleSendNFT,
}) => {
  // State to control which image is shown: true = front, false = back
  const [showFront, setShowFront] = useState(true);

  const toggleImage = () => {
    setShowFront(!showFront);
  };

  // Use the front image if available; if back image is missing, fall back to front.
  const frontImage = nft.image;
  const backImage = nft.imageBack || nft.image;
  const displayedImage = showFront ? frontImage : backImage;
  const altText = showFront ? "NFT Front" : "NFT Back";

  return (
    <div className="col s12 m6 l4">
      <div className="card">
        <div className="card-image" style={{ position: "relative" }}>
          {displayedImage ? (
            <img
              src={displayedImage.replace(
                "ipfs://",
                "https://silverbacksipfs.online/ipfs/"
              )}
              alt={altText}
              style={{ height: "200px", width: "100%", objectFit: "cover" }}
            />
          ) : (
            <p>No image available.</p>
          )}
          <button
            onClick={toggleImage}
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              zIndex: 100,
              pointerEvents: "auto",
              backgroundColor: "rgba(0,0,0,0.6)",
              color: "#fff",
              border: "none",
              padding: "5px 10px",
              cursor: "pointer",
            }}
          >
            {showFront ? "Show Back" : "Show Front"}
          </button>
          <div
            style={{
              position: "absolute",
              bottom: "0",
              left: "0",
              backgroundColor: "rgba(0,0,0,0.5)",
              color: "#fff",
              padding: "5px",
              fontSize: "14px",
            }}
          >
            Token ID: {nft.tokenId}
          </div>
        </div>
        <div
          className="card-action"
          style={{ display: "flex", justifyContent: "center", gap: "0.5rem" }}
        >
          {pk && ethers.utils.isHexString(pk, 32) ? (
            <>
              <button onClick={() => handleRedeemTo(nft.tokenId)} className="btn green">
                Redeem Stablecoin
              </button>
              <button onClick={() => handleClaimNFT(nft.tokenId)} className="btn blue">
                Claim NFT
              </button>
            </>
          ) : (
            <>
              <button onClick={() => handleRedeem(nft.tokenId)} className="btn green">
                Redeem NFT
              </button>
              <button onClick={() => handleSendNFT(nft.tokenId)} className="btn blue">
                Send NFT
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NFTCard;
