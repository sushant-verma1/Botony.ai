import { v2 as cloudinary } from "cloudinary";
import {
  cloudinaryCloudName,
  cloudinaryApiKey,
  cloudinaryApiSecret,
} from "./config.js";

cloudinary.config({
  cloud_name: cloudinaryCloudName,
  api_key: cloudinaryApiKey,
  api_secret: cloudinaryApiSecret,
  secure: true,
});

export { cloudinary };
